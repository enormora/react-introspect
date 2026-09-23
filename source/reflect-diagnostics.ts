import { AsyncLocalStorage } from 'node:async_hooks';
import diagnosticsChannel from 'node:diagnostics_channel';
import type { ReflectError, ReflectWarning } from './reflect-public-types.ts';

type ReflectDiagnosticMode = 'capture' | 'ignore' | 'throw';

type ReflectDiagnosticsOptions = {
    readonly errorMode: 'capture' | 'throw';
    readonly warningMode: ReflectDiagnosticMode;
};

type ReflectDiagnosticsContext = {
    readonly recordConsoleWarning: (message: readonly unknown[]) => void;
};

export type ReflectDiagnostics = {
    readonly errors: readonly ReflectError[];
    readonly hasWarnings: boolean;
    readonly warnings: readonly ReflectWarning[];
    readonly recordCaughtError: (cause: unknown) => void;
    readonly recordConsoleDiagnostic: (message: unknown) => void;
    readonly recordRecoverableError: (cause: unknown) => void;
    readonly recordUncaughtError: (cause: unknown) => void;
    readonly run: <Result>(action: () => Result) => Result;
    readonly runAsync: <Result>(action: () => Promise<Result>) => Promise<Result>;
};

const storage = new AsyncLocalStorage<ReflectDiagnosticsContext>();
const consoleDiagnosticChannels = Object.freeze([
    'console.error',
    'console.warn'
]);

function messageFromCause(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function throwDiagnostic(diagnostic: ReflectError | ReflectWarning): never {
    if (diagnostic.cause instanceof Error) {
        throw diagnostic.cause;
    }

    throw new Error(diagnostic.message);
}

function createReflectWarning(cause: unknown): ReflectWarning {
    return Object.freeze({
        cause,
        message: messageFromCause(cause)
    });
}

function createReflectError(cause: unknown, handled: boolean): ReflectError {
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

function recordReflectConsoleDiagnostic(message: unknown): void {
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
            diagnosticsChannel.subscribe(channelName, recordReflectConsoleDiagnostic);
        }

        ready = true;
    };
})();

export function createReflectDiagnostics(options: ReflectDiagnosticsOptions): ReflectDiagnostics {
    subscribeConsoleDiagnostics();

    let errors: readonly ReflectError[] = Object.freeze([]);
    let warnings: readonly ReflectWarning[] = Object.freeze([]);
    let pendingThrownDiagnostic: ReflectError | ReflectWarning | null = null;

    function appendWarning(warning: ReflectWarning): void {
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

    function appendError(error: ReflectError): void {
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

    const context: ReflectDiagnosticsContext = Object.freeze({
        recordConsoleWarning(message) {
            appendWarning(createReflectWarning(consoleMessageText(message)));
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
            recordReflectConsoleDiagnostic(message);
        },
        recordRecoverableError(cause) {
            appendWarning(createReflectWarning(cause));
        },
        recordUncaughtError(cause) {
            appendError(createReflectError(cause, false));
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
