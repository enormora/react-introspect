import { suite, test } from '@overkill-dev/test';
import type { IntrospectionSnapshot } from '../../snapshot/model/introspect-snapshot-contract.ts';
import {
    appendChild,
    createHostContainer,
    createHostInstance,
    createTextInstance,
    hideTextInstance,
    insertBefore,
    type IntrospectionHostContainer,
    removeChild,
    toSnapshot,
    unhideTextInstance
} from './introspect-host-tree.ts';

function createContainer(): IntrospectionHostContainer {
    return createHostContainer(
        function ignoreSnapshot() {
            return undefined;
        },
        function readNextRenderCount() {
            return 1;
        },
        { generator: undefined, prefix: 'test-' },
        undefined
    );
}

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function createButtonSnapshot(): IntrospectionSnapshot {
    const container = createContainer();
    const button = createHostInstance('button', { children: 'ignored', title: 'Save' }, undefined, {
        refs: undefined
    });
    const text = createTextInstance('Save');

    appendChild(button, text);
    appendChild(container, button);

    return toSnapshot(container);
}

export const testNode = suite('introspection host tree', [
    test('publishes host children as snapshot nodes', function (scope) {
        const snapshot = createButtonSnapshot();
        const root = requireValue(snapshot.root);

        scope.assert.equal(snapshot.renderCount, 1);
        scope.assert.equal(root.name, 'button');
        scope.assert.deepEqual(root.props, { title: 'Save' });
        scope.assert.equal(root.textContent, 'Save');

        return scope.assert.collect();
    }),
    test('maintains parent child order', function (scope) {
        const container = createContainer();
        const first = createHostInstance('span', { title: 'first' }, undefined, { refs: undefined });
        const second = createHostInstance('strong', { title: 'second' }, undefined, { refs: undefined });

        appendChild(container, second);
        insertBefore(container, first, second);

        const snapshot = toSnapshot(container);
        const root = requireValue(snapshot.root);

        scope.assert.deepEqual(
            root.renderedChildren.map(function readName(node) {
                return node.name;
            }),
            [ 'span', 'strong' ]
        );

        return scope.assert.collect();
    }),
    test('detaches moved children from their previous parent', function (scope) {
        const firstParent = createHostInstance('section', {}, undefined, { refs: undefined });
        const secondParent = createHostInstance('article', {}, undefined, { refs: undefined });
        const child = createTextInstance('moved');

        appendChild(firstParent, child);
        appendChild(secondParent, child);

        scope.assert.equal(firstParent.readChildren().length, 0);
        scope.assert.equal(secondParent.readChildren()[0], child);

        return scope.assert.collect();
    }),
    test('updates text visibility in snapshots', function (scope) {
        const container = createContainer();
        const text = createTextInstance('status');

        hideTextInstance(text);
        appendChild(container, text);

        scope.assert.equal(toSnapshot(container).root?.visibility, 'hidden');

        unhideTextInstance(text);

        scope.assert.equal(toSnapshot(container).root?.visibility, 'visible');

        return scope.assert.collect();
    }),
    test('removes children from parents', function (scope) {
        const container = createContainer();
        const text = createTextInstance('removed');

        appendChild(container, text);
        removeChild(container, text);

        const root = requireValue(toSnapshot(container).root);

        scope.assert.equal(root.name, 'Fragment');
        scope.assert.equal(root.renderedChildren.length, 0);

        return scope.assert.collect();
    })
]);
