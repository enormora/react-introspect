import { AsyncLocalStorage } from 'node:async_hooks';
import diagnosticsChannel from 'node:diagnostics_channel';
import type { ProbeError, ProbeWarning } from './probe-public-types.ts';

type ProbeDiagnosticMode = 'capture' | 'ignore' | 'throw';

type ProbeDiagnosticsOptions = {
    readonly errorMode: 'capture' | 'throw';
    readonly warningMode: ProbeDiagnosticMode;
};

type ProbeDiagnosticsContext = {
    readonly recordConsoleWarning: (message: readonly unknown[]) => void;
};

export type ProbeDiagnostics = {
    readonly errors: readonly ProbeError[];
    readonly hasWarnings: boolean;
    readonly warnings: readonly ProbeWarning[];
    readonly recordCaughtError: (cause: unknown) => void;
    readonly recordConsoleDiagnostic: (message: unknown) => void;
    readonly recordRecoverableError: (cause: unknown) => void;
    readonly recordUncaughtError: (cause: unknown) => void;
    readonly run: <Result>(action: () => Result) => Result;
    readonly runAsync: <Result>(action: () => Promise<Result>) => Promise<Result>;
};

const storage = new AsyncLocalStorage<ProbeDiagnosticsContext>();
const consoleDiagnosticChannels = Object.freeze([
    'console.error',
    'console.warn'
]);

function messageFromCause(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function throwDiagnostic(diagnostic: ProbeError | ProbeWarning): never {
    if (diagnostic.cause instanceof Error) {
        throw diagnostic.cause;
    }

    throw new Error(diagnostic.message);
}

function createProbeWarning(cause: unknown): ProbeWarning {
    return Object.freeze({
        cause,
        message: messageFromCause(cause)
    });
}

function createProbeError(cause: unknown, handled: boolean): ProbeError {
    return Object.freeze({
        cause,
        handled,
        message: messageFromCause(cause)
    });
}

function consoleMessageText(message: readonly unknown[]): string {
    return message.map(messageFromCause).join(' ');
}

function isReactDiagnosticMessage(message: readonly unknown[]): boolean {
    const text = consoleMessageText(message);

    return text.startsWith('Warning:') ||
        text.includes('React') ||
        text.includes('Each child in a list should have a unique') ||
        text.includes('Encountered two children with the same key') ||
        text.includes('Invalid hook call');
}

function toConsoleMessage(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : Object.freeze([ value ]);
}

function recordProbeConsoleDiagnostic(message: unknown): void {
    const consoleMessage = toConsoleMessage(message);

    if (!isReactDiagnosticMessage(consoleMessage)) {
        return;
    }

    storage.getStore()?.recordConsoleWarning(consoleMessage);
}

const subscribeConsoleDiagnostics = (function createConsoleDiagnosticsSubscription() {
    let ready = false;

    return function subscribe(): void {
        if (ready) {
            return;
        }

        for (const channelName of consoleDiagnosticChannels) {
            diagnosticsChannel.subscribe(channelName, recordProbeConsoleDiagnostic);
        }

        ready = true;
    };
})();

export function createProbeDiagnostics(options: ProbeDiagnosticsOptions): ProbeDiagnostics {
    subscribeConsoleDiagnostics();

    let errors: readonly ProbeError[] = Object.freeze([]);
    let warnings: readonly ProbeWarning[] = Object.freeze([]);
    let pendingThrownDiagnostic: ProbeError | ProbeWarning | null = null;

    function appendWarning(warning: ProbeWarning): void {
        if (options.warningMode === 'ignore') {
            return;
        }

        warnings = Object.freeze([
            ...warnings,
            warning
        ]);

        if (options.warningMode === 'throw') {
            pendingThrownDiagnostic = warning;
        }
    }

    function appendError(error: ProbeError): void {
        if (
            errors.some(function isSameError(existingError) {
                return existingError.cause === error.cause && existingError.handled === error.handled;
            })
        ) {
            return;
        }

        errors = Object.freeze([
            ...errors,
            error
        ]);

        if (options.errorMode === 'throw') {
            pendingThrownDiagnostic = error;
        }
    }

    function assertNoThrownDiagnostics(): void {
        if (pendingThrownDiagnostic !== null) {
            const diagnostic = pendingThrownDiagnostic;

            pendingThrownDiagnostic = null;
            throwDiagnostic(diagnostic);
        }
    }

    const context: ProbeDiagnosticsContext = Object.freeze({
        recordConsoleWarning(message) {
            appendWarning(createProbeWarning(consoleMessageText(message)));
        }
    });

    return Object.freeze({
        get errors() {
            return errors;
        },
        get hasWarnings() {
            return warnings.length > 0;
        },
        get warnings() {
            return warnings;
        },
        recordCaughtError() {
            return undefined;
        },
        recordConsoleDiagnostic(message) {
            recordProbeConsoleDiagnostic(message);
        },
        recordRecoverableError(cause) {
            appendWarning(createProbeWarning(cause));
        },
        recordUncaughtError(cause) {
            appendError(createProbeError(cause, false));
        },
        run<Result>(action: () => Result) {
            return storage.run(context, function runWithDiagnostics() {
                const result = action();

                assertNoThrownDiagnostics();

                return result;
            });
        },
        async runAsync<Result>(action: () => Promise<Result>) {
            return storage.run(context, async function runWithDiagnostics() {
                const result = await action();

                assertNoThrownDiagnostics();

                return result;
            });
        }
    });
}
