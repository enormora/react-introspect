import { suite, test } from '@overkill-dev/test';
import type { RuntimeIntrospectionNode } from '../types/introspect-runtime-types.ts';
import { createIntrospectionList } from './introspect-list.ts';

function createNode(name: string, textContent: string): RuntimeIntrospectionNode {
    return {
        callProp() {
            return undefined;
        },
        error: undefined,
        find() {
            return undefined;
        },
        findAll() {
            return createIntrospectionList([]);
        },
        findClosest() {
            return undefined;
        },
        formatTree() {
            return name;
        },
        givenChildren: createIntrospectionList([]),
        isStale: false,
        key: null,
        kind: 'host',
        name,
        omitProps() {
            return {};
        },
        path: name,
        pickProps() {
            return {};
        },
        props: {},
        renderedChildren: { nodes: createIntrospectionList([]), status: 'rendered' },
        sendEvent() {
            return undefined;
        },
        state: { activityMode: undefined, reason: undefined, rendered: true, visible: true },
        textContent,
        type: name,
        visibility: 'visible'
    };
}

export const testNode = suite('introspection list', [
    test('exposes stable indexed and iterable access', function (scope) {
        const first = createNode('button', 'Save');
        const last = createNode('span', 'Done');
        const list = createIntrospectionList([ first, last ]);

        scope.assert.equal(list.first, first);
        scope.assert.equal(list.last, last);
        scope.assert.equal(list.at(1), last);
        scope.assert.deepEqual(Array.from(list), [ first, last ]);

        return scope.assert.collect();
    }),
    test('filters by selectors', function (scope) {
        const list = createIntrospectionList([
            createNode('button', 'Save'),
            createNode('span', 'Done')
        ]);

        scope.assert.equal(list.filterBy({ textContent: 'Save' }).first?.name, 'button');
        scope.assert.equal(list.filterBy('span').length, 1);

        return scope.assert.collect();
    })
]);
