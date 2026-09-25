import { recordSink, suite, test, transcriptUsage } from '@overkill-dev/test';
import React from 'react';
import { createUnitIntrospectionView as introspect } from '../runtime/view/introspect-unit-view.test.ts';
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

function requireError(action: () => unknown): Error {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }

    throw new Error('Expected action to throw.');
}

function ThrowingComponent(): React.ReactNode {
    throw new Error('render failed');
}

function createConsoleDiagnosticPublisher(): ConsoleDiagnosticPublisher {
    let records: readonly ((message: unknown) => void)[] = Object.freeze([]);

    return Object.freeze({
        publish(message) {
            for (const record of records) {
                record(message);
            }
        },
        source: Object.freeze({
            subscribe(record: (message: unknown) => void) {
                records = Object.freeze([
                    ...records,
                    record
                ]);
            }
        })
    });
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

        scope.assert.equal(view.errors.length, 1);
        scope.assert.equal(view.errors[0]?.message, 'render failed');
        scope.assert.false(view.errors[0]?.handled);
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
        let subscriptions: readonly NodeConsoleSubscription[] = Object.freeze([]);
        const consoleDiagnostics = createNodeConsoleDiagnostics(Object.freeze({
            subscribe(name: string, record: (message: unknown) => void) {
                subscriptions = Object.freeze([
                    ...subscriptions,
                    [ name, record ]
                ]);
            }
        }));
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
    test('does not double-report caught errors', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');

        diagnostics.run(function recordCaughtError() {
            diagnostics.recordCaughtError(new Error('handled'));
        });

        scope.assert.equal(diagnostics.errors.length, 0);
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

        scope.assert.equal(diagnostics.errors.length, 1);
        scope.assert.equal(diagnostics.errors[0]?.message, 'same failure');

        return scope.assert.collect();
    }),
    test('maps React root error callbacks', function (scope) {
        const diagnostics = createIsolatedDiagnostics('capture');

        diagnostics.recordCaughtError(new Error('handled failure'));
        diagnostics.recordRecoverableError(new Error('recoverable failure'));
        diagnostics.recordUncaughtError(new Error('uncaught failure'));

        scope.assert.equal(diagnostics.errors.length, 1);
        scope.assert.equal(diagnostics.errors[0]?.message, 'uncaught failure');
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
    })
]);
