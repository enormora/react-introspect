import { suite, test } from '@overkill-dev/test';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionLocator,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionView
} from '../types/introspect-runtime-types.ts';
import { createIntrospectionList } from './introspect-list.ts';
import { createIntrospectionListLocator, createIntrospectionLocator } from './introspect-locator.ts';

function createNode(name: string): RuntimeIntrospectionNode {
    return {
        callProp(property: PropertyKey, parameter: unknown) {
            return `${String(property)}:${String(parameter)}`;
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
        sendEvent(eventName: string, parameter: unknown) {
            return `${eventName}:${String(parameter)}`;
        },
        state: { activityMode: undefined, reason: undefined, rendered: true, visible: true },
        textContent: name,
        type: name,
        visibility: 'visible'
    };
}

function createView(nodes: readonly RuntimeIntrospectionNode[]): RuntimeIntrospectionView {
    const view: RuntimeIntrospectionView = {
        errors: [],
        find(selector: unknown) {
            return nodes.find(function matchesNode(node) {
                return node.type === selector;
            });
        },
        findAll(selector: unknown): RuntimeIntrospectionList {
            return createIntrospectionList(nodes.filter(function matchesNode(node) {
                return node.type === selector;
            }));
        },
        formatTree() {
            return '';
        },
        hasWarnings: false,
        locate(selector: unknown) {
            return createIntrospectionLocator(view, selector);
        },
        locateAll(selector: unknown) {
            return createIntrospectionListLocator(view, selector);
        },
        renderCount: 1,
        renderedChildren: createIntrospectionList([]),
        root: undefined,
        textContent: '',
        unmount() {
            return undefined;
        },
        update() {
            return undefined;
        },
        async waitForIdle() {
            return undefined;
        },
        async waitForNextRender() {
            return undefined;
        },
        async waitForRenderCount() {
            return undefined;
        },
        async waitUntil() {
            return undefined;
        },
        warnings: []
    };

    return view;
}

function createSaveButton(title: string): RuntimeIntrospectionNode {
    return {
        ...createNode('button'),
        key: 'save',
        omitProps(keys) {
            return { omitted: keys };
        },
        pickProps(keys) {
            return { picked: keys };
        },
        props: { title },
        textContent: title
    };
}

function readProjections(locator: RuntimeIntrospectionLocator): Readonly<Record<string, unknown>> {
    return {
        key: locator.key,
        kind: locator.kind,
        name: locator.name,
        omitted: locator.omitProps([ 'title' ]),
        picked: locator.pickProps([ 'title' ]),
        props: locator.props,
        textContent: locator.textContent,
        type: locator.type
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

export const testNode = suite('introspection locators', [
    test('resolves nodes lazily through the owning view', function (scope) {
        const view = createView([ createNode('button') ]);
        const locator = createIntrospectionLocator(view, 'button');

        scope.assert.equal(locator.exists, true);
        scope.assert.equal(locator.node?.name, 'button');
        scope.assert.equal(locator.callProp('title', 'Save'), 'title:Save');
        scope.assert.equal(locator.sendEvent('click', 1), 'click:1');

        return scope.assert.collect();
    }),
    test('projects node data from the latest match', function (scope) {
        const nodes = [ createSaveButton('Save') ];
        const locator = createIntrospectionLocator(createView(nodes), 'button');
        const initial = readProjections(locator);

        nodes[0] = createSaveButton('Saving');

        scope.assert.deepEqual({ initial, updated: locator.textContent }, {
            initial: {
                key: 'save',
                kind: 'host',
                name: 'button',
                omitted: { omitted: [ 'title' ] },
                picked: { picked: [ 'title' ] },
                props: { title: 'Save' },
                textContent: 'Save',
                type: 'button'
            },
            updated: 'Saving'
        });

        return scope.assert.collect();
    }),
    test('projects undefined for a missing node', function (scope) {
        const locator = createIntrospectionLocator(createView([]), 'button');

        scope.assert.deepEqual(readProjections(locator), {
            key: undefined,
            kind: undefined,
            name: undefined,
            omitted: undefined,
            picked: undefined,
            props: undefined,
            textContent: undefined,
            type: undefined
        });

        return scope.assert.collect();
    }),
    test('throws for missing locator commands', function (scope) {
        const locator = createIntrospectionLocator(createView([]), 'button');

        scope.assert.equal(locator.exists, false);
        scope.assert.equal(
            requireError(function callMissingProp() {
                locator.callProp('title');
            })
                .message,
            'Cannot call a prop on a missing locator.'
        );
        scope.assert.equal(
            requireError(function sendMissingEvent() {
                locator.sendEvent('click');
            })
                .message,
            'Cannot send an event to a missing locator.'
        );

        return scope.assert.collect();
    }),
    test('returns list locator accessors from current matches', function (scope) {
        const first = createNode('button');
        const second = createNode('button');
        const locator = createIntrospectionListLocator(createView([ first, second ]), 'button');

        scope.assert.equal(locator.length, 2);
        scope.assert.equal(locator.first, first);
        scope.assert.equal(locator.last, second);
        scope.assert.equal(locator.at(1), second);
        scope.assert.deepEqual(Array.from(locator), [ first, second ]);

        return scope.assert.collect();
    })
]);
