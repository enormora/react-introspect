import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import { createIntrospectionView as introspect } from '../runtime/view/introspect-view.ts';
import { createIntrospectionDiagnostics, type IntrospectionDiagnostics } from './introspect-diagnostics.ts';

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

const assertCapturedRootError = defineCompositeAssertion({
    assert(check) {
        const view = introspect(React.createElement(ThrowingComponent), {
            errorMode: 'capture',
            strictMode: false,
            warningMode: 'capture'
        });

        return check.group([
            check.annotated('error count').equal(view.errors.length, 1),
            check.annotated('error message').equal(view.errors[0]?.message, 'render failed'),
            check.annotated('handled').false(view.errors[0]?.handled),
            check.annotated('warning count').equal(view.warnings.length, 0),
            check.annotated('root').undefined(view.root),
            check.annotated('render count').equal(view.renderCount, 1)
        ]);
    },
    name: 'assertCapturedRootError'
});

const assertThrownRootError = defineCompositeAssertion({
    assert(check) {
        const error = requireError(function renderThrowingComponent() {
            introspect(React.createElement(ThrowingComponent), {
                errorMode: 'throw',
                strictMode: false,
                warningMode: 'capture'
            });
        });

        return check.equal(error.message, 'render failed');
    },
    name: 'assertThrownRootError'
});

function createDiagnostics(warningMode: 'capture' | 'ignore' | 'throw'): IntrospectionDiagnostics {
    return createIntrospectionDiagnostics({
        errorMode: 'capture',
        warningMode
    });
}

function recordRecoverableWarning(diagnostics: IntrospectionDiagnostics, message: string): void {
    diagnostics.run(function recordWarning() {
        diagnostics.recordRecoverableError(new Error(message));
    });
}

const assertCapturedRecoverableWarning = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('capture');

        recordRecoverableWarning(diagnostics, 'recoverable warning');

        return check.group([
            check.annotated('has warnings').true(diagnostics.hasWarnings),
            check.annotated('warning count').equal(diagnostics.warnings.length, 1),
            check.annotated('warning message').equal(diagnostics.warnings[0]?.message, 'recoverable warning')
        ]);
    },
    name: 'assertCapturedRecoverableWarning'
});

const assertDefaultRecoverableWarningThrow = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('throw');
        const error = requireError(function renderWarningComponent() {
            recordRecoverableWarning(diagnostics, 'recoverable warning');
        });

        return check.group([
            check.annotated('error message').equal(error.message, 'recoverable warning'),
            check.annotated('warning count').equal(diagnostics.warnings.length, 1)
        ]);
    },
    name: 'assertDefaultRecoverableWarningThrow'
});

const assertIgnoredRecoverableWarning = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('ignore');

        recordRecoverableWarning(diagnostics, 'recoverable warning');

        return check.group([
            check.annotated('has warnings').false(diagnostics.hasWarnings),
            check.annotated('warning count').equal(diagnostics.warnings.length, 0)
        ]);
    },
    name: 'assertIgnoredRecoverableWarning'
});

const assertConsoleDiagnostics = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('capture');

        diagnostics.recordConsoleDiagnostic('Warning: outside Introspection');
        diagnostics.run(function recordConsoleWarning() {
            diagnostics.recordConsoleDiagnostic([ 'Warning:', 'console warning' ]);
            diagnostics.recordConsoleDiagnostic('ordinary application output');
        });

        return check.group([
            check.annotated('has warnings').true(diagnostics.hasWarnings),
            check.annotated('warning count').equal(diagnostics.warnings.length, 1),
            check.annotated('warning message').equal(diagnostics.warnings[0]?.message, 'Warning: console warning')
        ]);
    },
    name: 'assertConsoleDiagnostics'
});

const assertStringWarningThrow = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('throw');
        const error = requireError(function recordStringWarning() {
            diagnostics.run(function recordConsoleWarning() {
                diagnostics.recordConsoleDiagnostic('Warning: string warning');
            });
        });

        return check.equal(error.message, 'Warning: string warning');
    },
    name: 'assertStringWarningThrow'
});

const assertCaughtErrorsAreNotDoubleReported = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('capture');

        diagnostics.run(function recordCaughtError() {
            diagnostics.recordCaughtError(new Error('handled'));
        });

        return check.group([
            check.annotated('error count').equal(diagnostics.errors.length, 0),
            check.annotated('warning count').equal(diagnostics.warnings.length, 0)
        ]);
    },
    name: 'assertCaughtErrorsAreNotDoubleReported'
});

const assertDuplicateErrorsAreDeduped = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('capture');
        const error = new Error('same failure');

        diagnostics.run(function recordDuplicateErrors() {
            diagnostics.recordUncaughtError(error);
            diagnostics.recordUncaughtError(error);
        });

        return check.group([
            check.annotated('error count').equal(diagnostics.errors.length, 1),
            check.annotated('error message').equal(diagnostics.errors[0]?.message, 'same failure')
        ]);
    },
    name: 'assertDuplicateErrorsAreDeduped'
});

const assertRootCallbackMapping = defineCompositeAssertion({
    assert(check) {
        const diagnostics = createDiagnostics('capture');

        diagnostics.recordCaughtError(new Error('handled failure'));
        diagnostics.recordRecoverableError(new Error('recoverable failure'));
        diagnostics.recordUncaughtError(new Error('uncaught failure'));

        return check.group([
            check.annotated('error count').equal(diagnostics.errors.length, 1),
            check.annotated('error message').equal(diagnostics.errors[0]?.message, 'uncaught failure'),
            check.annotated('warning count').equal(diagnostics.warnings.length, 1),
            check.annotated('warning message').equal(diagnostics.warnings[0]?.message, 'recoverable failure')
        ]);
    },
    name: 'assertRootCallbackMapping'
});

const assertDiagnosticsIsolation = defineCompositeAssertion({
    assert(check) {
        const first = createDiagnostics('capture');
        const second = createDiagnostics('capture');

        recordRecoverableWarning(first, 'first warning');
        recordRecoverableWarning(second, 'second warning');

        return check.group([
            check.annotated('first diagnostics').deepEqual(
                first.warnings.map(function readMessage(warning) {
                    return warning.message;
                }),
                [ 'first warning' ]
            ),
            check.annotated('second diagnostics').deepEqual(
                second.warnings.map(function readMessage(warning) {
                    return warning.message;
                }),
                [ 'second warning' ]
            )
        ]);
    },
    name: 'assertDiagnosticsIsolation'
});

export const testNode = suite('diagnostics', [
    test('captures uncaught root errors on the view', function (scope) {
        scope.assert(assertCapturedRootError);

        return scope.assert.collect();
    }),
    test('throws uncaught root errors when error mode is throw', function (scope) {
        scope.assert(assertThrownRootError);

        return scope.assert.collect();
    }),
    test('captures recoverable warnings', function (scope) {
        scope.assert(assertCapturedRecoverableWarning);

        return scope.assert.collect();
    }),
    test('throws recoverable warnings in throw mode', function (scope) {
        scope.assert(assertDefaultRecoverableWarningThrow);

        return scope.assert.collect();
    }),
    test('ignores recoverable warnings when requested', function (scope) {
        scope.assert(assertIgnoredRecoverableWarning);

        return scope.assert.collect();
    }),
    test('captures React console diagnostics inside Introspection context', function (scope) {
        scope.assert(assertConsoleDiagnostics);

        return scope.assert.collect();
    }),
    test('throws string console warnings in throw mode', function (scope) {
        scope.assert(assertStringWarningThrow);

        return scope.assert.collect();
    }),
    test('does not double-report caught errors', function (scope) {
        scope.assert(assertCaughtErrorsAreNotDoubleReported);

        return scope.assert.collect();
    }),
    test('dedupes repeated uncaught errors', function (scope) {
        scope.assert(assertDuplicateErrorsAreDeduped);

        return scope.assert.collect();
    }),
    test('maps React root error callbacks', function (scope) {
        scope.assert(assertRootCallbackMapping);

        return scope.assert.collect();
    }),
    test('keeps Introspection diagnostics isolated', function (scope) {
        scope.assert(assertDiagnosticsIsolation);

        return scope.assert.collect();
    })
]);
