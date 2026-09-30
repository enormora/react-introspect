import { AsyncLocalStorage } from 'node:async_hooks';
import type { IntrospectionError, IntrospectionWarning } from '../public/introspect-public-types.ts';

type IntrospectionDiagnosticMode = 'capture' | 'ignore' | 'throw';
type ConsoleDiagnosticRecorder = (message: unknown) => void;

export type IntrospectionConsoleDiagnostics = {
    readonly subscribe: (record: ConsoleDiagnosticRecorder) => void;
};

export type IntrospectionDiagnosticsOptions = {
    readonly errorMode: 'capture' | 'throw';
    readonly warningMode: IntrospectionDiagnosticMode;
};

type IntrospectionDiagnosticsContext = {
    readonly recordConsoleWarning: (message: readonly unknown[]) => void;
};

export type IntrospectionDiagnostics = {
    readonly caughtErrors: readonly IntrospectionError[];
    readonly hasWarnings: boolean;
    readonly uncaughtErrors: readonly IntrospectionError[];
    readonly warnings: readonly IntrospectionWarning[];
    readonly holdUsageError: (error: TypeError) => void;
    readonly recordCaughtError: (cause: unknown) => void;
    readonly recordRecoverableError: (cause: unknown) => void;
    readonly recordUncaughtError: (cause: unknown) => void;
    readonly run: <Result>(action: () => Result) => Result;
    readonly runAsync: <Result>(action: () => Promise<Result>) => Promise<Result>;
};

type ThrownDiagnostic = IntrospectionError | IntrospectionWarning;

type ThrownDiagnosticFailure = { readonly diagnostic: ThrownDiagnostic; readonly kind: 'diagnostic'; };

type ThrownUsageFailure = { readonly error: TypeError; readonly kind: 'usage'; };

type ThrownFailure = ThrownDiagnosticFailure | ThrownUsageFailure;

type ThrownDiagnostics = {
    readonly hold: (diagnostic: ThrownDiagnostic) => void;
    readonly holdUsageError: (error: TypeError) => void;
    readonly run: <Result>(action: () => Result) => Result;
    readonly runAsync: <Result>(action: () => Promise<Result>) => Promise<Result>;
};

const storage = new AsyncLocalStorage<IntrospectionDiagnosticsContext>();
const subscribedConsoleDiagnostics = new WeakSet<IntrospectionConsoleDiagnostics>();

function messageFromCause(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

function throwDiagnostic(diagnostic: ThrownDiagnostic): never {
    if (diagnostic.cause instanceof Error) {
        throw diagnostic.cause;
    }

    throw new Error(diagnostic.message);
}

function isUsageFailure(failure: ThrownFailure): boolean {
    return failure.kind === 'usage';
}

function throwFailure(failure: ThrownFailure): never {
    if (failure.kind === 'usage') {
        throw failure.error;
    }

    throwDiagnostic(failure.diagnostic);
}

function createThrownDiagnostics(): ThrownDiagnostics {
    let unsettled: readonly ThrownFailure[] = [];

    function settle(): ThrownFailure | undefined {
        const firstFailure = unsettled.find(isUsageFailure) ?? unsettled[0];

        unsettled = [];

        return firstFailure;
    }

    function throwFirstUnsettled(): void {
        const failure = settle();

        if (failure !== undefined) {
            throwFailure(failure);
        }
    }

    function hold(failure: ThrownFailure): void {
        unsettled = [
            ...unsettled,
            failure
        ];
    }

    return {
        hold(diagnostic) {
            hold({ diagnostic, kind: 'diagnostic' });
        },
        holdUsageError(error) {
            hold({ error, kind: 'usage' });
        },
        run(action) {
            try {
                const result = action();

                throwFirstUnsettled();

                return result;
            } catch (error) {
                settle();
                throw error;
            }
        },
        async runAsync(action) {
            try {
                const result = await action();

                throwFirstUnsettled();

                return result;
            } catch (error) {
                settle();
                throw error;
            }
        }
    };
}

export function createDiagnosticRecord(cause: unknown): IntrospectionError & IntrospectionWarning {
    return Object.freeze({
        cause,
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
        text.includes('Invalid hook call') ||
        text.includes('Calling useContext(Context.Consumer)');
}

function toConsoleMessage(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [ value ];
}

function recordIntrospectionConsoleDiagnostic(message: unknown): void {
    const consoleMessage = toConsoleMessage(message);

    if (!isReactDiagnosticMessage(consoleMessage)) {
        return;
    }

    storage.getStore()?.recordConsoleWarning(consoleMessage);
}

function subscribeConsoleDiagnostics(consoleDiagnostics: IntrospectionConsoleDiagnostics): void {
    if (subscribedConsoleDiagnostics.has(consoleDiagnostics)) {
        return;
    }

    consoleDiagnostics.subscribe(recordIntrospectionConsoleDiagnostic);
    subscribedConsoleDiagnostics.add(consoleDiagnostics);
}

export function createIntrospectionDiagnostics(
    options: IntrospectionDiagnosticsOptions,
    consoleDiagnostics: IntrospectionConsoleDiagnostics
): IntrospectionDiagnostics {
    subscribeConsoleDiagnostics(consoleDiagnostics);

    let caughtErrors: readonly IntrospectionError[] = Object.freeze([]);
    let uncaughtErrors: readonly IntrospectionError[] = Object.freeze([]);
    let warnings: readonly IntrospectionWarning[] = Object.freeze([]);
    const thrownDiagnostics = createThrownDiagnostics();

    function appendWarning(warning: IntrospectionWarning): void {
        if (options.warningMode === 'ignore') {
            return;
        }

        warnings = Object.freeze([
            ...warnings,
            warning
        ]);

        if (options.warningMode === 'throw') {
            thrownDiagnostics.hold(warning);
        }
    }

    function appendUncaughtError(error: IntrospectionError): void {
        if (
            uncaughtErrors.some(function isSameError(existingError) {
                return existingError.cause === error.cause;
            })
        ) {
            return;
        }

        uncaughtErrors = Object.freeze([
            ...uncaughtErrors,
            error
        ]);

        if (options.errorMode === 'throw') {
            thrownDiagnostics.hold(error);
        }
    }

    const context: IntrospectionDiagnosticsContext = {
        recordConsoleWarning(message) {
            appendWarning(createDiagnosticRecord(consoleMessageText(message)));
        }
    };

    return {
        get caughtErrors() {
            return caughtErrors;
        },
        get hasWarnings() {
            return warnings.length > 0;
        },
        get uncaughtErrors() {
            return uncaughtErrors;
        },
        get warnings() {
            return warnings;
        },
        holdUsageError: thrownDiagnostics.holdUsageError,
        recordCaughtError(cause) {
            caughtErrors = Object.freeze([
                ...caughtErrors,
                createDiagnosticRecord(cause)
            ]);
        },
        recordRecoverableError(cause) {
            appendWarning(createDiagnosticRecord(cause));
        },
        recordUncaughtError(cause) {
            appendUncaughtError(createDiagnosticRecord(cause));
        },
        run<Result>(action: () => Result) {
            return storage.run(context, function runWithDiagnostics() {
                return thrownDiagnostics.run(action);
            });
        },
        async runAsync<Result>(action: () => Promise<Result>) {
            return storage.run(context, async function runWithDiagnostics() {
                return thrownDiagnostics.runAsync(action);
            });
        }
    };
}
