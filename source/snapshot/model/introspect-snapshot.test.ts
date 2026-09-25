import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type { IntrospectionOptions, IntrospectionView } from '../../public/introspect-public-types.ts';
import { createUnitIntrospectionView } from '../../runtime/view/introspect-unit-view.test.ts';
import type { IntrospectionSnapshot, SnapshotNode } from './introspect-snapshot-contract.ts';

type WidgetProps = React.PropsWithChildren<{
    readonly label: string;
    readonly metadata: {
        readonly actions: readonly {
            readonly id: string;
        }[];
        readonly group: string;
    };
}>;

function introspect(
    element: React.ReactElement,
    options: IntrospectionOptions
): IntrospectionView {
    return createUnitIntrospectionView(element, options) as IntrospectionView;
}

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

function uniqueNodeIds(nodes: readonly SnapshotNode[]): number {
    const ids = nodes.map(function readId(node) {
        return node.id;
    });

    return uniqueValues(ids).length;
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

const assertSnapshotShape = defineCompositeAssertion({
    assert(check, nodes: readonly SnapshotNode[]) {
        const root = findSnapshotNode(nodes, 'fragment', 'Fragment');
        const section = findSnapshotNode(nodes, 'host', 'section');
        const strong = findSnapshotNode(nodes, 'host', 'strong');
        const widget = findSnapshotNode(nodes, 'component', 'Widget');

        return check.group([
            check.annotated('unique node ids').equal(uniqueNodeIds(nodes), nodes.length),
            check.annotated('frozen root').true(Object.isFrozen(root)),
            check.annotated('section parent').equal(section.parentId, root.id),
            check.annotated('strong parent').equal(strong.parentId, section.id),
            check.annotated('widget parent').equal(widget.parentId, root.id),
            check.annotated('kind counts').deepEqual(kindCounts(nodes), {
                component: 1,
                empty: 3,
                fragment: 1,
                host: 3,
                opaque: 1,
                text: 3
            })
        ]);
    },
    name: 'assertSnapshotShape'
});

const assertGivenAndRenderedChildren = defineCompositeAssertion({
    assert(check) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const section = requireValue(view.find('section'));
        const widget = requireValue(view.find(Widget));

        return check.group([
            check.annotated('section rendered children').equal(section.renderedChildren.status, 'rendered'),
            check.annotated('section given children').equal(section.givenChildren.length, 2),
            check.annotated('widget given child').equal(widget.givenChildren.first?.type, 'em'),
            check.annotated('widget rendered children').deepEqual(widget.renderedChildren, {
                reason: 'depth',
                status: 'notRendered'
            })
        ]);
    },
    name: 'assertGivenAndRenderedChildren'
});

const assertSelectorSemantics = defineCompositeAssertion({
    assert(check) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const section = requireValue(view.find('section'));

        return check.group([
            check.annotated('key selector').equal(view.find({ key: 'host' })?.path, section.path),
            check.annotated('text selector').equal(view.find({ textContent: 'Save now' })?.path, section.path),
            check.annotated('pattern selector').equal(view.find({ textContent: /^Save\snow$/ })?.path, section.path),
            check.annotated('props selector').equal(
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
            ),
            check.annotated('has selector').equal(
                view
                    .find({
                        has: { type: 'strong' },
                        where(node) {
                            return node.textContent === 'Save now';
                        }
                    })
                    ?.type,
                'section'
            ),
            check.annotated('missing closest').undefined(requireValue(view.find('strong')).findClosest('main')),
            check.annotated('missing props selector').undefined(
                view.find({
                    props: {
                        metadata: {
                            group: 'secondary'
                        }
                    },
                    type: Widget
                })
            )
        ]);
    },
    name: 'assertSelectorSemantics'
});

const assertIntrospectionList = defineCompositeAssertion({
    assert(check) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const renderedText = view.findAll('#text');

        return check.group([
            check.annotated('rendered text count').equal(renderedText.length, 2),
            check.annotated('first rendered text').equal(renderedText.first?.textContent, 'Save '),
            check.annotated('last rendered text').equal(renderedText.last?.textContent, 'now'),
            check.annotated('indexed rendered text').equal(renderedText.at(1)?.textContent, 'now'),
            check.annotated('rendered text').deepEqual(
                Array.from(renderedText, function readText(node) {
                    return node.textContent;
                }),
                [ 'Save ', 'now' ]
            ),
            check.annotated('empty nodes').equal(view.findAll('#empty').length, 3),
            check.annotated('filtered sections').equal(
                view.findAll('section').filterBy({ has: { type: 'strong' } }).length,
                1
            )
        ]);
    },
    name: 'assertIntrospectionList'
});

const assertAcyclicPublicOutput = defineCompositeAssertion({
    assert(check) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const serializedRoot = JSON.stringify(view.root);

        return check.group([
            check.annotated('serialized type').string(serializedRoot),
            check.annotated('fragment name').match(requireValue(serializedRoot), /"name":"Fragment"/)
        ]);
    },
    name: 'assertAcyclicPublicOutput'
});

export const testNode = suite('snapshot tree model', [
    test('builds frozen committed snapshots with node ids and kinds', function (scope) {
        const snapshot = createMixedSnapshot();

        scope.assert.equal(snapshot.renderCount, 1);
        scope.assert(assertSnapshotShape, snapshot.nodes);

        return scope.assert.collect();
    }),
    test('normalizes given children and rendered children', function (scope) {
        scope.assert(assertGivenAndRenderedChildren);

        return scope.assert.collect();
    }),
    test('matches selectors against tree nodes', function (scope) {
        scope.assert(assertSelectorSemantics);

        return scope.assert.collect();
    }),
    test('provides stable list behavior over matching nodes', function (scope) {
        scope.assert(assertIntrospectionList);

        return scope.assert.collect();
    }),
    test('keeps public node output acyclic', function (scope) {
        scope.assert(assertAcyclicPublicOutput);

        return scope.assert.collect();
    })
]);
