import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type {
    IntrospectionNode,
    IntrospectionOptions,
    IntrospectionView
} from '../../public/introspect-public-types.ts';
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

type IconProps = {
    readonly name: string;
};

type TabProps = {
    readonly actions: readonly React.ReactNode[];
    readonly badge: React.ReactElement;
    readonly config: {
        readonly icon: React.ReactElement<IconProps>;
    };
    readonly label: string;
};

function Badge(props: React.PropsWithChildren): React.ReactNode {
    return props.children;
}

function Icon(props: IconProps): React.ReactNode {
    return props.name;
}

function Tab(props: TabProps): React.ReactNode {
    Reflect.ownKeys(props);

    return null;
}

function TabPage(): React.ReactNode {
    return React.createElement(Tab, {
        actions: [ React.createElement(Icon, { key: 'archive', name: 'archive' }), 'more', null ],
        badge: React.createElement(Badge, null, React.createElement('strong', null, '3')),
        config: { icon: React.createElement(Icon, { name: 'gear' }) },
        label: 'Inbox'
    });
}

function isIntrospectionNode(value: unknown): value is IntrospectionNode {
    return typeof value === 'object' && value !== null && Object.hasOwn(value, 'kind');
}

function readPropEntry(value: unknown): unknown {
    return isIntrospectionNode(value) ? value.type : value;
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

export const testNode = suite('snapshot tree model', [
    test('builds frozen committed snapshots with node ids and kinds', function (scope) {
        const snapshot = createMixedSnapshot();
        const root = findSnapshotNode(snapshot.nodes, 'fragment', 'Fragment');
        const section = findSnapshotNode(snapshot.nodes, 'host', 'section');
        const strong = findSnapshotNode(snapshot.nodes, 'host', 'strong');
        const widget = findSnapshotNode(snapshot.nodes, 'component', 'Widget');

        scope.assert.deepEqual({
            frozenRoot: Object.isFrozen(root),
            kindCounts: kindCounts(snapshot.nodes),
            renderCount: snapshot.renderCount,
            sectionParentId: section.parentId,
            strongParentId: strong.parentId,
            uniqueNodeIds: uniqueNodeIds(snapshot.nodes),
            widgetParentId: widget.parentId
        }, {
            frozenRoot: true,
            kindCounts: {
                component: 1,
                empty: 3,
                fragment: 1,
                host: 3,
                opaque: 1,
                text: 3
            },
            renderCount: 1,
            sectionParentId: root.id,
            strongParentId: section.id,
            uniqueNodeIds: snapshot.nodes.length,
            widgetParentId: root.id
        });

        return scope.assert.collect();
    }),
    test('normalizes given children and rendered children', function (scope) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const section = requireValue(view.find('section'));
        const widget = requireValue(view.find(Widget));

        scope.assert.equal(section.renderedChildren.status, 'rendered');
        scope.assert.equal(section.givenChildren.length, 2);
        scope.assert.equal(widget.givenChildren.first?.type, 'em');
        scope.assert.equal(widget.renderedChildren.status, 'rendered');
        scope.assert.equal(widget.state.reason, 'depth');
        scope.assert.equal(
            widget.renderedChildren.status === 'rendered' ? widget.renderedChildren.nodes.first?.type : undefined,
            'em'
        );

        return scope.assert.collect();
    }),
    test('exposes elements in props as introspection nodes', function (scope) {
        const view = introspect(React.createElement(TabPage), { strictMode: false });
        const tab = requireValue(view.find(Tab));
        const { badge } = tab.props;

        scope.assert.deepEqual({
            actions: Array.from(tab.props.actions, readPropEntry),
            actionPath: tab.props.actions.map(function readPath(action) {
                return isIntrospectionNode(action) ? action.path : undefined;
            }),
            badgeClosest: badge.findClosest(Tab)?.path,
            badgeKind: badge.kind,
            badgePath: badge.path,
            badgeStrong: badge.find('strong')?.textContent,
            badgeText: badge.textContent,
            badgeType: badge.type,
            configIconName: tab.props.config.icon.props.name,
            label: tab.props.label,
            matchedBySelector: view.find({ props: { badge: { type: Badge } }, type: Tab })?.path,
            searchedFromView: view.find(Badge)
        }, {
            actions: [ Icon, 'more', null ],
            actionPath: [ 'TabPage > Tab[0] > Icon[actions.0]', undefined, undefined ],
            badgeClosest: 'TabPage > Tab[0]',
            badgeKind: 'component',
            badgePath: 'TabPage > Tab[0] > Badge[badge]',
            badgeStrong: '3',
            badgeText: '3',
            badgeType: Badge,
            configIconName: 'gear',
            label: 'Inbox',
            matchedBySelector: 'TabPage > Tab[0]',
            searchedFromView: undefined
        });

        return scope.assert.collect();
    }),
    test('cuts circular values that pass through elements in props', function (scope) {
        const settings: Record<string, unknown> = {};

        settings.icon = React.createElement(Icon, { name: 'loop', settings } as IconProps);

        const view = introspect(React.createElement(Widget, { label: 'Loop', metadata: settings } as never), {
            depth: 0,
            strictMode: false
        });
        const { metadata } = requireValue(view.root).props as Readonly<
            Record<string, Readonly<Record<string, unknown>>>
        >;
        const icon = metadata?.icon;

        scope.assert.deepEqual(
            { iconProps: isIntrospectionNode(icon) ? icon.props : undefined },
            { iconProps: { name: 'loop', settings: '[Circular]' } }
        );

        return scope.assert.collect();
    }),
    test('exposes node kinds without magic type names', function (scope) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const root = requireValue(view.root);

        scope.assert.deepEqual({
            childKinds: Array.from(view.renderedChildren, function readKind(node) {
                return node.kind;
            }),
            rootKind: root.kind,
            textKind: view.find({ textContent: 'now', type: '#text' })?.kind
        }, {
            childKinds: [ 'host', 'component', 'empty', 'empty', 'empty', 'opaque' ],
            rootKind: 'fragment',
            textKind: 'text'
        });

        return scope.assert.collect();
    }),
    test('matches selectors against tree nodes', function (scope) {
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
        scope.assert.undefined(requireValue(view.find('strong')).findClosest('main'));
        scope.assert.undefined(
            view.find({
                props: {
                    metadata: {
                        group: 'secondary'
                    }
                },
                type: Widget
            })
        );

        return scope.assert.collect();
    }),
    test('provides stable list behavior over matching nodes', function (scope) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const renderedText = view.findAll('#text');

        scope.assert.equal(renderedText.length, 3);
        scope.assert.equal(renderedText.first?.textContent, 'Save ');
        scope.assert.equal(renderedText.last?.textContent, 'given');
        scope.assert.equal(renderedText.at(1)?.textContent, 'now');
        scope.assert.deepEqual(
            Array.from(renderedText, function readText(node) {
                return node.textContent;
            }),
            [ 'Save ', 'now', 'given' ]
        );
        scope.assert.equal(view.findAll('#empty').length, 3);
        scope.assert.equal(view.findAll('section').filterBy({ has: { type: 'strong' } }).length, 1);

        return scope.assert.collect();
    }),
    test('keeps public node output acyclic', function (scope) {
        const view = introspect(createMixedTree(), { depth: 0 });
        const serializedRoot = JSON.stringify(view.root);

        scope.assert.string(serializedRoot);
        scope.assert.match(requireValue(serializedRoot), /"name":"Fragment"/);

        return scope.assert.collect();
    })
]);
