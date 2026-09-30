import { suite, test } from '@overkill-dev/test';
import { createIntrospectionUsageError, isIntrospectionUsageError } from './usage-error.ts';

export const testNode = suite('introspection usage errors', [
    test('recognizes only errors created as usage errors', function (scope) {
        const usageError = createIntrospectionUsageError('misused');

        scope.assert.deepEqual({
            message: usageError.message,
            plainTypeError: isIntrospectionUsageError(new TypeError('misused')),
            typeError: usageError instanceof TypeError,
            usageError: isIntrospectionUsageError(usageError)
        }, {
            message: 'misused',
            plainTypeError: false,
            typeError: true,
            usageError: true
        });

        return scope.assert.collect();
    })
]);
