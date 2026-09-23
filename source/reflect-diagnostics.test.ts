import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { createReflectDiagnostics, type ReflectDiagnostics } from './reflect-diagnostics.ts';
import { reflect } from './react-reflect.entry-point.ts';

type EqualScope = {
    readonly assert: {
        readonly equal: (actual: unknown, expected: unknown) => void;
        readonly match: (actual: string, expected: RegExp) => void;
    };
};

type ThrowsScope = EqualScope & {
    readonly assert: EqualScope['assert'] & {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
    };
};

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

function assertCapturedRootError(scope: EqualScope): void {
    const view = reflect(React.createElement(ThrowingComponent), {
        errorMode: 'capture',
        strictMode: false,
        warningMode: 'capture'
    });

    scope.assert.equal(view.errors.length, 1);
    scope.assert.equal(view.errors[0]?.message, 'render failed');
    scope.assert.equal(view.errors[0]?.handled, false);
    scope.assert.equal(view.warnings.length, 0);
    scope.assert.equal(view.root, undefined);
    scope.assert.equal(view.renderCount, 1);
}

function assertThrownRootError(scope: EqualScope): void {
    const error = requireError(function renderThrowingComponent() {
        reflect(React.createElement(ThrowingComponent), {
            errorMode: 'throw',
            strictMode: false,
            warningMode: 'capture'
        });
    });

    scope.assert.equal(error.message, 'render failed');
}

function createDiagnostics(warningMode: 'capture' | 'ignore' | 'throw'): ReflectDiagnostics {
    return createReflectDiagnostics({
        errorMode: 'capture',
        warningMode
    });
}

function recordRecoverableWarning(diagnostics: ReflectDiagnostics, message: string): void {
    diagnostics.run(function recordWarning() {
        diagnostics.recordRecoverableError(new Error(message));
    });
}

function assertCapturedRecoverableWarning(scope: EqualScope): void {
    const diagnostics = createDiagnostics('capture');

    recordRecoverableWarning(diagnostics, 'recoverable warning');

    scope.assert.equal(diagnostics.hasWarnings, true);
    scope.assert.equal(diagnostics.warnings.length, 1);
    scope.assert.equal(diagnostics.warnings[0]?.message, 'recoverable warning');
}

function assertDefaultRecoverableWarningThrow(scope: EqualScope): void {
    const diagnostics = createDiagnostics('throw');
    const error = requireError(function renderWarningComponent() {
        recordRecoverableWarning(diagnostics, 'recoverable warning');
    });

    scope.assert.equal(error.message, 'recoverable warning');
    scope.assert.equal(diagnostics.warnings.length, 1);
}

function assertIgnoredRecoverableWarning(scope: EqualScope): void {
    const diagnostics = createDiagnostics('ignore');

    recordRecoverableWarning(diagnostics, 'recoverable warning');

    scope.assert.equal(diagnostics.hasWarnings, false);
    scope.assert.equal(diagnostics.warnings.length, 0);
}

function assertConsoleDiagnostics(scope: EqualScope): void {
    const diagnostics = createDiagnostics('capture');

    diagnostics.recordConsoleDiagnostic('Warning: outside Reflect');
    diagnostics.run(function recordConsoleWarning() {
        diagnostics.recordConsoleDiagnostic([ 'Warning:', 'console warning' ]);
        diagnostics.recordConsoleDiagnostic('ordinary application output');
    });

    scope.assert.equal(diagnostics.hasWarnings, true);
    scope.assert.equal(diagnostics.warnings.length, 1);
    scope.assert.equal(diagnostics.warnings[0]?.message, 'Warning: console warning');
}

function assertStringWarningThrow(scope: EqualScope): void {
    const diagnostics = createDiagnostics('throw');
    const error = requireError(function recordStringWarning() {
        diagnostics.run(function recordConsoleWarning() {
            diagnostics.recordConsoleDiagnostic('Warning: string warning');
        });
    });

    scope.assert.equal(error.message, 'Warning: string warning');
}

function assertCaughtErrorsAreNotDoubleReported(scope: EqualScope): void {
    const diagnostics = createDiagnostics('capture');

    diagnostics.run(function recordCaughtError() {
        diagnostics.recordCaughtError(new Error('handled'));
    });

    scope.assert.equal(diagnostics.errors.length, 0);
    scope.assert.equal(diagnostics.warnings.length, 0);
}

function assertDuplicateErrorsAreDeduped(scope: EqualScope): void {
    const diagnostics = createDiagnostics('capture');
    const error = new Error('same failure');

    diagnostics.run(function recordDuplicateErrors() {
        diagnostics.recordUncaughtError(error);
        diagnostics.recordUncaughtError(error);
    });

    scope.assert.equal(diagnostics.errors.length, 1);
    scope.assert.equal(diagnostics.errors[0]?.message, 'same failure');
}

function assertRootCallbackMapping(scope: EqualScope): void {
    const diagnostics = createDiagnostics('capture');

    diagnostics.recordCaughtError(new Error('handled failure'));
    diagnostics.recordRecoverableError(new Error('recoverable failure'));
    diagnostics.recordUncaughtError(new Error('uncaught failure'));

    scope.assert.equal(diagnostics.errors.length, 1);
    scope.assert.equal(diagnostics.errors[0]?.message, 'uncaught failure');
    scope.assert.equal(diagnostics.warnings.length, 1);
    scope.assert.equal(diagnostics.warnings[0]?.message, 'recoverable failure');
}

function assertDiagnosticsIsolation(scope: ThrowsScope): void {
    const first = createDiagnostics('capture');
    const second = createDiagnostics('capture');

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
}

export const testNode = suite('diagnostics', [
    test('captures uncaught root errors on the view', function verifyUncaughtErrors(scope) {
        assertCapturedRootError(scope);

        return scope.assert.collect();
    }),
    test('throws uncaught root errors when error mode is throw', function verifyThrownRootErrors(scope) {
        assertThrownRootError(scope);

        return scope.assert.collect();
    }),
    test('captures recoverable warnings', function verifyRecoverableWarnings(scope) {
        assertCapturedRecoverableWarning(scope);

        return scope.assert.collect();
    }),
    test('throws recoverable warnings in throw mode', function verifyDefaultWarningThrow(scope) {
        assertDefaultRecoverableWarningThrow(scope);

        return scope.assert.collect();
    }),
    test('ignores recoverable warnings when requested', function verifyIgnoredWarnings(scope) {
        assertIgnoredRecoverableWarning(scope);

        return scope.assert.collect();
    }),
    test('captures React console diagnostics inside Reflect context', function verifyConsoleWarnings(scope) {
        assertConsoleDiagnostics(scope);

        return scope.assert.collect();
    }),
    test('throws string console warnings in throw mode', function verifyStringWarningThrow(scope) {
        assertStringWarningThrow(scope);

        return scope.assert.collect();
    }),
    test('does not double-report caught errors', function verifyCaughtErrors(scope) {
        assertCaughtErrorsAreNotDoubleReported(scope);

        return scope.assert.collect();
    }),
    test('dedupes repeated uncaught errors', function verifyDuplicateErrors(scope) {
        assertDuplicateErrorsAreDeduped(scope);

        return scope.assert.collect();
    }),
    test('maps React root error callbacks', function verifyRootCallbacks(scope) {
        assertRootCallbackMapping(scope);

        return scope.assert.collect();
    }),
    test('keeps Reflect diagnostics isolated', function verifyParallelWarnings(scope) {
        assertDiagnosticsIsolation(scope);

        return scope.assert.collect();
    })
]);
