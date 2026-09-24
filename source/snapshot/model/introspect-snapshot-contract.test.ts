import { suite, test } from '@overkill-dev/test';
import { createEmptyIntrospectionSnapshot } from './introspect-snapshot-contract.ts';

export const testNode = suite('introspection snapshot contract', [
    test('creates an immutable empty snapshot for a render count', function verifyEmptySnapshot(scope) {
        const snapshot = createEmptyIntrospectionSnapshot(3);

        scope.assert.equal(Object.isFrozen(snapshot), true);
        scope.assert.equal(Object.isFrozen(snapshot.nodes), true);
        scope.assert.equal(snapshot.renderCount, 3);
        scope.assert.equal(snapshot.root, undefined);
        scope.assert.deepEqual(snapshot.nodes, []);

        return scope.assert.collect();
    })
]);
