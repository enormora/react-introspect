import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    assertSupportedReactValue,
    createUnsupportedReactValueError,
    isReactPortalValue
} from './introspect-unsupported-react.ts';

function createPortalValue(): unknown {
    return {
        $$typeof: Symbol.for('react.portal')
    };
}

function requireError(action: () => void): Error {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }

    throw new Error('Expected action to throw.');
}

export const testNode = suite('unsupported React values', [
    test('identifies React portal records', function verifyPortalDetection(scope) {
        scope.assert.equal(isReactPortalValue(createPortalValue()), true);
        scope.assert.equal(isReactPortalValue({ $$typeof: Symbol.for('react.element') }), false);

        return scope.assert.collect();
    }),
    test('throws a stable portal error for nested children', function verifyNestedPortal(scope) {
        const error = requireError(function validateValue() {
            assertSupportedReactValue(React.createElement(
                'div',
                null,
                [ 'text', createPortalValue() as React.ReactNode ]
            ));
        });

        scope.assert.equal(error.message, createUnsupportedReactValueError().message);

        return scope.assert.collect();
    })
]);
