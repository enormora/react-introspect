import { suite, test } from '@overkill-dev/test';
import { isIntrospectionRenderError, throwIntrospectionRenderError } from './introspect-render-error.ts';

function catchThrown(value: unknown): unknown {
    try {
        throwIntrospectionRenderError(value);
    } catch (error) {
        return error;
    }

    throw new Error('Expected action to throw.');
}

export const testNode = suite('introspection render errors', [
    test('tracks render errors without marking thenables', function (scope) {
        const error = new Error('failed');
        const thenable = {
            then() {
                return undefined;
            }
        };

        scope.assert.equal(catchThrown(error), error);
        scope.assert.equal(catchThrown(thenable), thenable);
        scope.assert.equal(isIntrospectionRenderError(error), true);
        scope.assert.equal(isIntrospectionRenderError(thenable), false);

        return scope.assert.collect();
    })
]);
