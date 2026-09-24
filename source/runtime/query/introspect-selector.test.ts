import { suite, test } from '@overkill-dev/test';
import type { IntrospectionSelector } from '../../public/introspect-public-types.ts';
import type { RuntimeIntrospectionNode } from '../types/introspect-runtime-types.ts';
import { createIntrospectionList } from './introspect-list.ts';
import { nodeMatchesSelector, toSelector } from './introspect-selector.ts';

function createNode(): RuntimeIntrospectionNode {
    return {
        callProp() {
            return undefined;
        },
        error: undefined,
        find(selector: unknown) {
            if (selector === 'strong') {
                return createNode();
            }

            return typeof selector === 'object' && selector !== null && Reflect.get(selector, 'type') === 'strong'
                ? createNode()
                : undefined;
        },
        findAll() {
            return createIntrospectionList([]);
        },
        findClosest() {
            return undefined;
        },
        formatTree() {
            return 'button';
        },
        givenChildren: createIntrospectionList([]),
        isStale: false,
        key: 'save',
        name: 'button',
        omitProps() {
            return {};
        },
        path: 'button',
        pickProps() {
            return {};
        },
        props: {
            metadata: {
                actions: [ { id: 'save' } ]
            },
            title: 'Save'
        },
        renderedChildren: { nodes: createIntrospectionList([]), status: 'rendered' },
        sendEvent() {
            return undefined;
        },
        state: { activityMode: undefined, reason: undefined, rendered: true, visible: true },
        textContent: 'Save now',
        type: 'button',
        visibility: 'visible'
    };
}

export const testNode = suite('introspection selector', [
    test('normalizes non-selector values to type selectors', function verifyToSelector(scope) {
        scope.assert.deepEqual(toSelector('button'), { type: 'button' });
        scope.assert.deepEqual(toSelector({ type: 'button' }), { type: 'button' });

        return scope.assert.collect();
    }),
    test('matches type, key, props, text, child, and predicate selectors', function verifyMatches(scope) {
        const node = createNode();

        scope.assert.equal(
            nodeMatchesSelector(node, {
                has: { type: 'strong' },
                key: 'save',
                props: { metadata: { actions: [ { id: 'save' } ] } },
                textContent: /save/iu,
                type: 'button',
                where(target) {
                    return target.name === 'button';
                }
            }),
            true
        );
        scope.assert.equal(nodeMatchesSelector(node, { props: { title: 'Delete' } }), false);
        const selectorWithUndefinedTextContent = { textContent: undefined } as unknown as IntrospectionSelector;

        scope.assert.equal(nodeMatchesSelector(node, selectorWithUndefinedTextContent), true);

        return scope.assert.collect();
    })
]);
