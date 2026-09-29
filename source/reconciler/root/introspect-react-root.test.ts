import { suite, test } from '@overkill-dev/test';
import { hasScheduledRootTask } from './introspect-react-root.ts';

export const testNode = suite('React root access', [
    test('reports whether the root has a scheduled task', function (scope) {
        scope.assert.equal(hasScheduledRootTask({ callbackNode: null }), false);
        scope.assert.equal(hasScheduledRootTask({ callbackNode: { callback: 'not callable' } }), false);
        scope.assert.equal(
            hasScheduledRootTask({
                callbackNode: {
                    callback() {
                        return undefined;
                    }
                }
            }),
            true
        );

        return scope.assert.collect();
    }),
    test('fails loudly when the root no longer exposes its scheduled task', function (scope) {
        scope.assert.throws(
            function () {
                hasScheduledRootTask({});
            },
            { message: 'React Introspect expected the React root to expose callbackNode.' }
        );

        return scope.assert.collect();
    })
]);
