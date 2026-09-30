import { recordSink, suite, test, transcriptUsage } from '@overkill-dev/test';
import React from 'react';
import { createUnitIntrospectionView as introspect } from '../runtime/view/introspect-unit-view.test.ts';
import type { IntrospectionError } from '../public/introspect-public-types.ts';
import {
    createIntrospectionDiagnostics,
    type IntrospectionConsoleDiagnostics,
    type IntrospectionDiagnostics
} from './introspect-diagnostics.ts';
import { createNodeConsoleDiagnostics } from './introspect-node-console-diagnostics.ts';

type ConsoleDiagnosticPublisher = {
    readonly publish: (message: unknown) => void;
    readonly source: IntrospectionConsoleDiagnostics;
};

type NodeConsoleSubscription = readonly [
    name: string,
    record: (message: unknown) => void
];

function describeOutcome(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? `threw: ${error.message}` : 'threw';
    }

    return 'returned';
}

async function readAsyncError(pending: Promise<unknown>): Promise<Error> {
    try {
        await pending;
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }

    throw new Error('Expected the operation to fail.');
}

type RunWithUsageErrorCheck = {
    readonly finish: () => Promise<void>;
    readonly holdsUsageError: () => boolean;
};

async function startRunWithUsageErrorCheck(diagnostics: IntrospectionDiagnostics): Promise<RunWithUsageErrorCheck> {
    const gate = Promise.withResolvers<undefined>();
    const checkCreated = Promise.withResolvers<() => boolean>();
    const pending = diagnostics.runAsync(async function waitWithCheck() {
        checkCreated.resolve(diagnostics.createUsageErrorCheck());
        await gate.promise;
    });
    const holdsUsageError = await checkCreated.promise;

    return {
        async finish() {
            gate.resolve(undefined);
            await pending;
        },
        holdsUsageError
    };
}

function requireError(action: () => unknown): Error {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }

    throw new Error('Expected action to throw.');
}

function readErrorMessage(error: IntrospectionError): string {
    return error.message;
}

function ThrowingComponent(): React.ReactNode {
    throw new Error('render failed');
}

function createConsoleDiagnosticPublisher(): ConsoleDiagnosticPublisher {
    let records: readonly ((message: unknown) => void)[] = [];

    return {
        publish(message) {
            for (const record of records) {
                record(message);
            }
        },
        source: {
            subscribe(record: (message: unknown) => void) {
                records = [
                    ...records,
                    record
                ];
            }
        }
    };
}

function createDiagnostics(
    warningMode: 'capture' | 'ignore' | 'throw',
    consoleDiagnostics: IntrospectionConsoleDiagnostics
): IntrospectionDiagnostics {
    return createIntrospectionDiagnostics({
        errorMode: 'capture',
        warningMode
    }, consoleDiagnostics);
}

function createIsolatedDiagnostics(warningMode: 'capture' | 'ignore' | 'throw'): IntrospectionDiagnostics {
    return createDiagnostics(warningMode, createConsoleDiagnosticPublisher().source);
}

function recordRecoverableWarning(diagnostics: IntrospectionDiagnostics, message: string): void {
    diagnostics.run(function recordWarning() {
        diagnostics.recordRecoverableError(new Error(message));
    });
}

export const testNode = suite('diagnostics', [
    test('captures uncaught root errors on the view', function (scope) {
        const view = introspect(React.createElement(ThrowingComponent), {
            errorMode: 'capture',
            strictMode: false,
            warningMode: 'capture'
        });

        scope.assert.equal(view.uncaughtErrors.length, 1);
        scope.assert.equal(view.uncaughtErrors[0]?.message, 'render failed');
        scope.assert.equal(view.caughtErrors.length, 0);
        scope.assert.equal(view.warnings.length, 0);
        scope.assert.undefined(view.root);
        scope.assert.equal(view.renderCount, 1);

        return scope.assert.collect();
    }),
    test('throws uncaught root errors when error mode is throw', function (scope) {
        const error = requireError(function renderThrowingComponent() {
            introspect(React.createElement(ThrowingComponent), {
                errorMode: 'throw',
                strictMode: false,
                warningMode: 'capture'
            });
        });

        scope.assert.equal(error.message, 'render failed');

        return scope.assert.collect();
    }),
    test('captures recoverable warnings', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');

        recordRecoverableWarning(diagnostics, 'recoverable warning');

        scope.assert.true(diagnostics.hasWarnings);
        scope.assert.equal(diagnostics.warnings.length, 1);
        scope.assert.equal(diagnostics.warnings[0]?.message, 'recoverable warning');

        return scope.assert.collect();
    }),
    test('throws recoverable warnings in throw mode', function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const error = requireError(function renderWarningComponent() {
            recordRecoverableWarning(diagnostics, 'recoverable warning');
        });

        scope.assert.equal(error.message, 'recoverable warning');
        scope.assert.equal(diagnostics.warnings.length, 1);

        return scope.assert.collect();
    }),
    test('ignores recoverable warnings when requested', function (scope) {
        const diagnostics = createIsolatedDiagnostics('ignore');

        recordRecoverableWarning(diagnostics, 'recoverable warning');

        scope.assert.false(diagnostics.hasWarnings);
        scope.assert.equal(diagnostics.warnings.length, 0);

        return scope.assert.collect();
    }),
    test('captures React console diagnostics inside Introspection context', function (scope) {
        const consoleDiagnostics = createConsoleDiagnosticPublisher();
        const diagnostics = createDiagnostics('capture', consoleDiagnostics.source);

        consoleDiagnostics.publish('Warning: outside Introspection');
        diagnostics.run(function recordConsoleWarning() {
            consoleDiagnostics.publish([ 'Warning:', 'console warning' ]);
            consoleDiagnostics.publish('ordinary application output');
        });

        scope.assert.true(diagnostics.hasWarnings);
        scope.assert.equal(diagnostics.warnings.length, 1);
        scope.assert.equal(diagnostics.warnings[0]?.message, 'Warning: console warning');

        return scope.assert.collect();
    }),
    test('throws string console warnings in throw mode', function (scope) {
        const consoleDiagnostics = createConsoleDiagnosticPublisher();
        const diagnostics = createDiagnostics('throw', consoleDiagnostics.source);
        const error = requireError(function recordStringWarning() {
            diagnostics.run(function recordConsoleWarning() {
                consoleDiagnostics.publish('Warning: string warning');
            });
        });

        scope.assert.equal(error.message, 'Warning: string warning');

        return scope.assert.collect();
    }),
    test('subscribes the Node console diagnostic channels', function (scope) {
        let subscriptions: readonly NodeConsoleSubscription[] = [];
        const consoleDiagnostics = createNodeConsoleDiagnostics({
            subscribe(name: string, record: (message: unknown) => void) {
                subscriptions = [
                    ...subscriptions,
                    [ name, record ]
                ];
            }
        });
        const messages = recordSink<readonly [kind: 'message', message: unknown]>(function subscribe(record) {
            consoleDiagnostics.subscribe(function recordMessage(message) {
                record('message', message);
            });

            return function disposeMessages() {
                return undefined;
            };
        });

        scope.cleanup(function disposeMessages() {
            messages.dispose();
        });
        subscriptions[0]?.[1]('error message');
        subscriptions[1]?.[1]([ 'warn', 'message' ]);

        scope.assert.deepEqual(
            subscriptions.map(function readName(subscription) {
                return subscription[0];
            }),
            [ 'console.error', 'console.warn' ]
        );
        scope.assert(transcriptUsage.exactly, messages, [
            [ 'message', 'error message' ],
            [ 'message', [ 'warn', 'message' ] ]
        ]);

        return scope.assert.collect();
    }),
    test('records caught errors without throwing in error throw mode', function (scope) {
        const diagnostics = createIntrospectionDiagnostics({
            errorMode: 'throw',
            warningMode: 'capture'
        }, createConsoleDiagnosticPublisher().source);

        diagnostics.run(function recordCaughtError() {
            diagnostics.recordCaughtError(new Error('caught'));
        });

        scope.assert.equal(diagnostics.caughtErrors[0]?.message, 'caught');
        scope.assert.equal(diagnostics.uncaughtErrors.length, 0);
        scope.assert.equal(diagnostics.warnings.length, 0);

        return scope.assert.collect();
    }),
    test('dedupes repeated uncaught errors', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');
        const error = new Error('same failure');

        diagnostics.run(function recordDuplicateErrors() {
            diagnostics.recordUncaughtError(error);
            diagnostics.recordUncaughtError(error);
        });

        scope.assert.equal(diagnostics.uncaughtErrors.length, 1);
        scope.assert.equal(diagnostics.uncaughtErrors[0]?.message, 'same failure');

        return scope.assert.collect();
    }),
    test('maps React root error callbacks', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');

        diagnostics.recordCaughtError(new Error('caught failure'));
        diagnostics.recordRecoverableError(new Error('recoverable failure'));
        diagnostics.recordUncaughtError(new Error('uncaught failure'));

        scope.assert.deepEqual(diagnostics.caughtErrors.map(readErrorMessage), [ 'caught failure' ]);
        scope.assert.deepEqual(diagnostics.uncaughtErrors.map(readErrorMessage), [ 'uncaught failure' ]);
        scope.assert.equal(diagnostics.warnings.length, 1);
        scope.assert.equal(diagnostics.warnings[0]?.message, 'recoverable failure');

        return scope.assert.collect();
    }),
    test('keeps Introspection diagnostics isolated', function (scope) {
        const first = createIsolatedDiagnostics('capture');
        const second = createIsolatedDiagnostics('capture');

        recordRecoverableWarning(first, 'first warning');
        recordRecoverableWarning(second, 'second warning');

        scope.assert.deepEqual(
            first.warnings.map(function readMessage(warning) {
                return warning.message;
            }),
            [ 'first warning' ]
        );
        scope.assert.deepEqual(
            second.warnings.map(function readMessage(warning) {
                return warning.message;
            }),
            [ 'second warning' ]
        );

        return scope.assert.collect();
    }),
    test('throws a diagnostic recorded outside any run from the next run', function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');

        diagnostics.recordRecoverableError(new Error('between operations'));

        const error = requireError(function runNextOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.equal(error.message, 'between operations');

        return scope.assert.collect();
    }),
    test('keeps a diagnostic from a failing run out of later runs', function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const failure = requireError(function runFailingOperation() {
            diagnostics.run(function warnThenFail() {
                diagnostics.recordRecoverableError(new Error('recoverable warning'));

                throw new Error('operation failed');
            });
        });
        const later = describeOutcome(function runLaterOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.deepEqual(
            { failure: failure.message, later, warnings: diagnostics.warnings.length },
            { failure: 'operation failed', later: 'returned', warnings: 1 }
        );

        return scope.assert.collect();
    }),
    test('keeps a diagnostic from a failing async run out of later runs', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const failure = await readAsyncError(diagnostics.runAsync(async function warnThenFail() {
            diagnostics.recordRecoverableError(new Error('recoverable warning'));

            throw new Error('operation failed');
        }));
        const later = describeOutcome(function runLaterOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.deepEqual(
            { failure: failure.message, later, warnings: diagnostics.warnings.length },
            { failure: 'operation failed', later: 'returned', warnings: 1 }
        );

        return scope.assert.collect();
    }),
    test('throws the first diagnostic recorded in a successful async run', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const error = await readAsyncError(diagnostics.runAsync(async function warnThenResolve() {
            diagnostics.recordRecoverableError(new Error('async warning'));

            return 'done';
        }));

        scope.assert.equal(error.message, 'async warning');

        return scope.assert.collect();
    }),
    test('keeps the diagnostic of an async run when a concurrent run fails', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const gate = Promise.withResolvers<undefined>();
        const pending = readAsyncError(diagnostics.runAsync(async function warnThenWait() {
            diagnostics.recordRecoverableError(new Error('async warning'));
            await gate.promise;
        }));
        const concurrentFailure = requireError(function runFailingOperation() {
            diagnostics.run(function fail() {
                throw new Error('operation failed');
            });
        });

        gate.resolve(undefined);

        const asyncError = await pending;

        scope.assert.deepEqual(
            { asyncError: asyncError.message, concurrentFailure: concurrentFailure.message },
            { asyncError: 'async warning', concurrentFailure: 'operation failed' }
        );

        return scope.assert.collect();
    }),
    test('leaves the diagnostic of an async run to that run when a concurrent run succeeds', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const gate = Promise.withResolvers<undefined>();
        const pending = readAsyncError(diagnostics.runAsync(async function warnThenWait() {
            diagnostics.recordRecoverableError(new Error('async warning'));
            await gate.promise;
        }));
        const concurrentOutcome = describeOutcome(function runOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        gate.resolve(undefined);

        const asyncError = await pending;

        scope.assert.deepEqual(
            { asyncError: asyncError.message, concurrentOutcome },
            { asyncError: 'async warning', concurrentOutcome: 'returned' }
        );

        return scope.assert.collect();
    }),
    test('throws a diagnostic from work that outlived its run from the next run', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const gate = Promise.withResolvers<undefined>();

        async function warnAfterGate(): Promise<void> {
            await gate.promise;
            diagnostics.recordRecoverableError(new Error('late warning'));
        }

        const backgroundWork = diagnostics.run(warnAfterGate);

        gate.resolve(undefined);
        await backgroundWork;

        const error = requireError(function runNextOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.equal(error.message, 'late warning');

        return scope.assert.collect();
    }),
    test('keeps a diagnostic held inside the run of another view for its own next run', function (scope) {
        const outer = createIsolatedDiagnostics('throw');
        const inner = createIsolatedDiagnostics('throw');
        const outerOutcome = describeOutcome(function runOuterOperation() {
            outer.run(function warnOnInner() {
                inner.recordRecoverableError(new Error('inner warning'));
            });
        });
        const innerOutcome = describeOutcome(function runInnerOperation() {
            inner.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.deepEqual(
            { innerOutcome, outerOutcome },
            { innerOutcome: 'threw: inner warning', outerOutcome: 'returned' }
        );

        return scope.assert.collect();
    }),
    test('throws a held usage error before a held diagnostic', function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const usageError = new TypeError('usage failed');
        const error = requireError(function runOperation() {
            diagnostics.run(function warnThenMisuse() {
                diagnostics.recordRecoverableError(new Error('recoverable warning'));
                diagnostics.holdUsageError(usageError);
            });
        });

        scope.assert.equal(error, usageError);

        return scope.assert.collect();
    }),
    test('keeps a usage error from a failing run out of later runs', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');
        const failure = requireError(function runFailingOperation() {
            diagnostics.run(function misuseThenFail() {
                diagnostics.holdUsageError(new TypeError('usage failed'));

                throw new Error('operation failed');
            });
        });
        const later = describeOutcome(function runLaterOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.deepEqual({ failure: failure.message, later }, { failure: 'operation failed', later: 'returned' });

        return scope.assert.collect();
    }),
    test('checks only its own run and the between-runs queue for held usage errors', async function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');
        const waitingRun = await startRunWithUsageErrorCheck(diagnostics);
        const seenFromOtherRun: boolean[] = [];
        const otherRunOutcome = describeOutcome(function runOtherOperation() {
            diagnostics.run(function misuse() {
                diagnostics.holdUsageError(new TypeError('usage failed'));
                seenFromOtherRun.push(waitingRun.holdsUsageError());
            });
        });

        await waitingRun.finish();

        scope.assert.deepEqual(
            { otherRunOutcome, seenFromOtherRun },
            { otherRunOutcome: 'threw: usage failed', seenFromOtherRun: [ false ] }
        );

        return scope.assert.collect();
    }),
    test('reports a usage error held between runs as held outside any run', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');
        const heldBefore = diagnostics.holdsUsageError();

        diagnostics.holdUsageError(new TypeError('usage failed'));

        scope.assert.deepEqual(
            { heldAfter: diagnostics.holdsUsageError(), heldBefore },
            { heldAfter: true, heldBefore: false }
        );

        return scope.assert.collect();
    }),
    test('throws a usage error held outside any run from the next run', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');
        const usageError = new TypeError('usage failed');

        diagnostics.holdUsageError(usageError);

        const error = requireError(function runNextOperation() {
            diagnostics.run(function doNothing() {
                return undefined;
            });
        });

        scope.assert.equal(error, usageError);

        return scope.assert.collect();
    }),
    test('throws the first of several diagnostics recorded in one run', function (scope) {
        const diagnostics = createIsolatedDiagnostics('throw');
        const error = requireError(function runWarningOperation() {
            diagnostics.run(function warnTwice() {
                diagnostics.recordRecoverableError(new Error('first warning'));
                diagnostics.recordRecoverableError(new Error('second warning'));
            });
        });

        scope.assert.equal(error.message, 'first warning');

        return scope.assert.collect();
    })
]);
