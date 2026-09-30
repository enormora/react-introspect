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
    readonly createUsageErrorCheck: () => () => boolean;
    readonly holdUsageError: (error: TypeError) => void;
    readonly holdsUsageError: () => boolean;
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
    readonly createUsageErrorCheck: () => () => boolean;
    readonly holdUsageError: (error: TypeError) => void;
    readonly holdsUsageError: () => boolean;
    readonly run: <Result>(context: IntrospectionDiagnosticsContext, action: () => Result) => Result;
    readonly runAsync: <Result>(
        context: IntrospectionDiagnosticsContext,
        action: () => Promise<Result>
    ) => Promise<Result>;
};

type FailureQueue = {
    readonly hold: (failure: ThrownFailure) => void;
    readonly read: () => readonly ThrownFailure[];
    readonly take: () => readonly ThrownFailure[];
};

type OperationWindow = {
    readonly close: () => readonly ThrownFailure[];
    readonly hold: (failure: ThrownFailure) => void;
    readonly isOpen: () => boolean;
    readonly read: () => readonly ThrownFailure[];
};

type DiagnosticsScope = {
    readonly context: IntrospectionDiagnosticsContext;
    readonly owner: WeakKey;
    readonly window: OperationWindow;
};

const storage = new AsyncLocalStorage<DiagnosticsScope>();
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

function createFailureQueue(): FailureQueue {
    let held: readonly ThrownFailure[] = [];

    return {
        hold(failure) {
            held = [
                ...held,
                failure
            ];
        },
        read() {
            return held;
        },
        take() {
            const taken = held;

            held = [];

            return taken;
        }
    };
}

function createOperationWindow(): OperationWindow {
    const queue = createFailureQueue();
    let open = true;

    return {
        close() {
            open = false;

            return queue.take();
        },
        hold: queue.hold,
        isOpen() {
            return open;
        },
        read: queue.read
    };
}

function throwFirstFailure(failures: readonly ThrownFailure[]): void {
    const failure = failures.find(isUsageFailure) ?? failures[0];

    if (failure !== undefined) {
        throwFailure(failure);
    }
}

function createThrownDiagnostics(): ThrownDiagnostics {
    const owner = Object.freeze({});
    const betweenOperations = createFailureQueue();

    function readOpenWindow(): OperationWindow | undefined {
        const scope = storage.getStore();

        return scope?.owner === owner && scope.window.isOpen() ? scope.window : undefined;
    }

    function hold(failure: ThrownFailure): void {
        (readOpenWindow() ?? betweenOperations).hold(failure);
    }

    function createUsageErrorCheck(): () => boolean {
        const window = readOpenWindow();

        return function holdsUsageErrorForWindow() {
            const windowFailures = window?.isOpen() === true ? window.read() : [];

            return [ ...betweenOperations.read(), ...windowFailures ].some(isUsageFailure);
        };
    }

    function settleOperation(window: OperationWindow): void {
        throwFirstFailure([ ...betweenOperations.take(), ...window.close() ]);
    }

    return {
        hold(diagnostic) {
            hold({ diagnostic, kind: 'diagnostic' });
        },
        holdUsageError(error) {
            hold({ error, kind: 'usage' });
        },
        createUsageErrorCheck,
        holdsUsageError() {
            return createUsageErrorCheck()();
        },
        run(context, action) {
            const window = createOperationWindow();

            return storage.run({ context, owner, window }, function runInOperationWindow() {
                try {
                    const result = action();

                    settleOperation(window);

                    return result;
                } catch (error) {
                    window.close();
                    throw error;
                }
            });
        },
        async runAsync(context, action) {
            const window = createOperationWindow();

            return storage.run({ context, owner, window }, async function runInOperationWindow() {
                try {
                    const result = await action();

                    settleOperation(window);

                    return result;
                } catch (error) {
                    window.close();
                    throw error;
                }
            });
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

    storage.getStore()?.context.recordConsoleWarning(consoleMessage);
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
        createUsageErrorCheck: thrownDiagnostics.createUsageErrorCheck,
        holdUsageError: thrownDiagnostics.holdUsageError,
        holdsUsageError: thrownDiagnostics.holdsUsageError,
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
        run(action) {
            return thrownDiagnostics.run(context, action);
        },
        async runAsync(action) {
            return thrownDiagnostics.runAsync(context, action);
        }
    };
}
