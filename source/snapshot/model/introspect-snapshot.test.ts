import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { introspect } from '../../react-introspect.entry-point.ts';
import type { IntrospectionSnapshot, SnapshotNode } from './introspect-snapshot-contract.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
        readonly match: (actual: string, expected: RegExp) => void;
    };
};

type WidgetProps = React.PropsWithChildren<{
    readonly label: string;
    readonly metadata: {
        readonly actions: readonly {
            readonly id: string;
        }[];
        readonly group: string;
    };
}>;

function Widget(props: WidgetProps): React.ReactNode {
    Reflect.ownKeys(props);

    return React.createElement('output');
}

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function uniqueValues(values: readonly unknown[]): readonly unknown[] {
    return Array.from(new Set(values));
}

function findSnapshotNode(nodes: readonly SnapshotNode[], kind: SnapshotNode['kind'], name: string): SnapshotNode {
    return requireValue(nodes.find(function matchesNode(node) {
        return node.kind === kind && node.name === name;
    }));
}

function kindCounts(nodes: readonly SnapshotNode[]): Readonly<Record<SnapshotNode['kind'], number>> {
    const counts: Record<SnapshotNode['kind'], number> = {
        component: 0,
        empty: 0,
        fragment: 0,
        host: 0,
        opaque: 0,
        text: 0
    };

    for (const node of nodes) {
        counts[node.kind] += 1;
    }

    return Object.freeze(counts);
}

function assertUniqueNodeIds(scope: EqualScope, nodes: readonly SnapshotNode[]): void {
    const ids = nodes.map(function readId(node) {
        return node.id;
    });

    scope.assert.equal(uniqueValues(ids).length, nodes.length);
}

function createMixedTree(): React.ReactElement {
    return React.createElement(
        React.Fragment,
        null,
        React.createElement(
            'section',
            { key: 'host' },
            'Save ',
            React.createElement('strong', null, 'now')
        ),
        React.createElement(
            Widget,
            {
                key: 'widget',
                label: 'Archive',
                metadata: {
                    actions: [
                        { id: 'archive' },
                        { id: 'cancel' }
                    ],
                    group: 'primary'
                }
            },
            React.createElement('em', null, 'given')
        ),
        null,
        false,
        undefined,
        { opaque: true } as never
    );
}

function createMixedSnapshot(): IntrospectionSnapshot {
    const view = introspect(createMixedTree(), { depth: 0 }) as unknown as {
        readonly currentSnapshot: IntrospectionSnapshot;
    };

    return view.currentSnapshot;
}

function assertSnapshotShape(scope: EqualScope, nodes: readonly SnapshotNode[]): void {
    const root = findSnapshotNode(nodes, 'fragment', 'Fragment');
    const section = findSnapshotNode(nodes, 'host', 'section');
    const strong = findSnapshotNode(nodes, 'host', 'strong');
    const widget = findSnapshotNode(nodes, 'component', 'Widget');

    assertUniqueNodeIds(scope, nodes);
    scope.assert.equal(Object.isFrozen(root), true);
    scope.assert.equal(section.parentId, root.id);
    scope.assert.equal(strong.parentId, section.id);
    scope.assert.equal(widget.parentId, root.id);
    scope.assert.deepEqual(kindCounts(nodes), {
        component: 1,
        empty: 3,
        fragment: 1,
        host: 3,
        opaque: 1,
        text: 3
    });
}

function assertGivenAndRenderedChildren(scope: EqualScope): void {
    const view = introspect(createMixedTree(), { depth: 0 });
    const section = requireValue(view.find('section'));
    const widget = requireValue(view.find(Widget));

    scope.assert.equal(section.renderedChildren.status, 'rendered');
    scope.assert.equal(section.givenChildren.length, 2);
    scope.assert.equal(widget.givenChildren.first?.type, 'em');
    scope.assert.deepEqual(widget.renderedChildren, {
        reason: 'depth',
        status: 'notRendered'
    });
}

function assertSelectorSemantics(scope: EqualScope): void {
    const view = introspect(createMixedTree(), { depth: 0 });
    const section = requireValue(view.find('section'));

    scope.assert.equal(view.find({ key: 'host' })?.path, section.path);
    scope.assert.equal(view.find({ textContent: 'Save now' })?.path, section.path);
    scope.assert.equal(view.find({ textContent: /^Save\snow$/ })?.path, section.path);
    scope.assert.equal(
        view
            .find({
                props: {
                    metadata: {
                        actions: [
                            { id: 'archive' }
                        ]
                    }
                },
                type: Widget
            })
            ?.name,
        'Widget'
    );
    scope.assert.equal(
        view
            .find({
                has: { type: 'strong' },
                where(node) {
                    return node.textContent === 'Save now';
                }
            })
            ?.type,
        'section'
    );
    scope.assert.equal(requireValue(view.find('strong')).findClosest('main'), undefined);
    scope.assert.equal(
        view.find({
            props: {
                metadata: {
                    group: 'secondary'
                }
            },
            type: Widget
        }),
        undefined
    );
}

function assertIntrospectionList(scope: EqualScope): void {
    const view = introspect(createMixedTree(), { depth: 0 });
    const renderedText = view.findAll('#text');

    scope.assert.equal(renderedText.length, 2);
    scope.assert.equal(renderedText.first?.textContent, 'Save ');
    scope.assert.equal(renderedText.last?.textContent, 'now');
    scope.assert.equal(renderedText.at(1)?.textContent, 'now');
    scope.assert.deepEqual(
        Array.from(renderedText, function readText(node) {
            return node.textContent;
        }),
        [ 'Save ', 'now' ]
    );
    scope.assert.equal(view.findAll('#empty').length, 3);
    scope.assert.equal(view.findAll('section').filterBy({ has: { type: 'strong' } }).length, 1);
}

function assertAcyclicPublicOutput(scope: EqualScope): void {
    const view = introspect(createMixedTree(), { depth: 0 });
    const serializedRoot = JSON.stringify(view.root);

    scope.assert.equal(typeof serializedRoot, 'string');
    scope.assert.match(requireValue(serializedRoot), /"name":"Fragment"/);
}

export const testNode = suite('snapshot tree model', [
    test('builds frozen committed snapshots with node ids and kinds', function verifySnapshotShape(scope) {
        const snapshot = createMixedSnapshot();

        scope.assert.equal(snapshot.renderCount, 1);
        assertSnapshotShape(scope, snapshot.nodes);

        return scope.assert.collect();
    }),
    test('normalizes given children and rendered children', function verifyChildSnapshots(scope) {
        assertGivenAndRenderedChildren(scope);

        return scope.assert.collect();
    }),
    test('matches selectors against tree nodes', function verifySelectors(scope) {
        assertSelectorSemantics(scope);

        return scope.assert.collect();
    }),
    test('provides stable list behavior over matching nodes', function verifyIntrospectionList(scope) {
        assertIntrospectionList(scope);

        return scope.assert.collect();
    }),
    test('keeps public node output acyclic', function verifyPublicOutput(scope) {
        assertAcyclicPublicOutput(scope);

        return scope.assert.collect();
    })
]);
