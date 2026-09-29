import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { assertNotPortal, assertSupportedReactValue } from './introspect-unsupported-react.ts';

const portalErrorMessage = 'React Introspect cannot represent portal output yet.';

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
    test('rejects React portal records and accepts other React records', function (scope) {
        const error = requireError(function validatePortal() {
            assertNotPortal(createPortalValue());
        });

        assertNotPortal({ $$typeof: Symbol.for('react.element') });
        scope.assert.equal(error.message, portalErrorMessage);

        return scope.assert.collect();
    }),
    test('throws a stable portal error for nested children', function (scope) {
        const error = requireError(function validateValue() {
            assertSupportedReactValue(React.createElement(
                'div',
                null,
                [ 'text', createPortalValue() as React.ReactNode ]
            ));
        });

        scope.assert.equal(error.message, portalErrorMessage);

        return scope.assert.collect();
    })
]);
