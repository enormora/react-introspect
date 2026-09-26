import { suite, test } from '@overkill-dev/test';
import type { IntrospectionSnapshot, SnapshotNode } from '../../snapshot/model/introspect-snapshot-contract.ts';
import { createIntrospectionNode, type SnapshotReader } from './introspect-node.ts';

type Count = {
    readonly read: () => number;
};

type SnapshotNodeSeed = {
    readonly id: number;
    readonly name: string;
    readonly parentId: number | undefined;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly textContent: string;
};

function createSnapshotNode(seed: SnapshotNodeSeed): SnapshotNode {
    return {
        activityMode: undefined,
        error: undefined,
        givenChildren: [],
        id: seed.id,
        key: null,
        kind: 'host',
        name: seed.name,
        parentId: seed.parentId,
        path: seed.name,
        props: seed.props,
        renderedChildren: seed.renderedChildren,
        renderedReason: undefined,
        textContent: seed.textContent,
        type: seed.name,
        visibility: 'visible'
    };
}

function createSnapshot(): IntrospectionSnapshot {
    const label = createSnapshotNode({
        id: 2,
        name: 'span',
        parentId: 1,
        props: { title: 'Label' },
        renderedChildren: [],
        textContent: 'Save'
    });
    const button = createSnapshotNode({
        id: 1,
        name: 'button',
        parentId: undefined,
        props: {
            onClick(value: string) {
                return `clicked:${value}`;
            },
            title: 'Save'
        },
        renderedChildren: [ label ],
        textContent: 'Save'
    });

    return {
        nodes: [ button, label ],
        renderCount: 1,
        root: button
    };
}

function createReader(snapshot: IntrospectionSnapshot, count: Count): SnapshotReader {
    return {
        act(action: () => unknown) {
            return action();
        },
        hostEvent: {},
        get currentSnapshot() {
            return {
                nodes: snapshot.nodes,
                renderCount: count.read(),
                root: snapshot.root
            };
        }
    };
}

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function requireError(action: () => void): Error {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
    }

    throw new Error('Expected action to throw.');
}

export const testNode = suite('introspection node', [
    test('reads snapshot node properties and children', function (scope) {
        const snapshot = createSnapshot();
        const node = createIntrospectionNode(
            createReader(snapshot, {
                read() {
                    return 1;
                }
            }),
            snapshot,
            requireValue(snapshot.nodes[0])
        );

        scope.assert.equal(node.name, 'button');
        scope.assert.equal(node.renderedChildren.status, 'rendered');
        scope.assert.equal(
            node.renderedChildren.status === 'rendered' ? node.renderedChildren.nodes.first?.name : '',
            'span'
        );
        scope.assert.equal(node.find('span')?.textContent, 'Save');
        scope.assert.deepEqual(node.pickProps([ 'title' ]), { title: 'Save' });
        scope.assert.deepEqual(node.omitProps([ 'onClick' ]), { title: 'Save' });

        return scope.assert.collect();
    }),
    test('calls props, sends events, finds parents, and formats trees', function (scope) {
        const snapshot = createSnapshot();
        const reader = createReader(snapshot, {
            read() {
                return 1;
            }
        });
        const button = createIntrospectionNode(reader, snapshot, requireValue(snapshot.nodes[0]));
        const label = createIntrospectionNode(reader, snapshot, requireValue(snapshot.nodes[1]));

        scope.assert.equal(button.sendEvent('click', 'primary'), 'clicked:primary');
        scope.assert.equal(button.callProp('onClick', 'direct'), 'clicked:direct');
        scope.assert.equal(label.findClosest('button')?.name, 'button');
        scope.assert.equal(button.findClosest('form'), undefined);
        scope.assert.equal(button.formatTree(), 'button\n  span');

        return scope.assert.collect();
    }),
    test('reports non-callable prop calls clearly', function (scope) {
        const snapshot = createSnapshot();
        const node = createIntrospectionNode(
            createReader(snapshot, {
                read() {
                    return 1;
                }
            }),
            snapshot,
            requireValue(snapshot.nodes[0])
        );

        scope.assert.equal(
            requireError(function callTitle() {
                node.callProp('title');
            })
                .message,
            'Prop title is not callable.'
        );

        return scope.assert.collect();
    }),
    test('reports stale nodes after newer snapshots', function (scope) {
        const snapshot = createSnapshot();
        const node = createIntrospectionNode(
            createReader(snapshot, {
                read() {
                    return 2;
                }
            }),
            snapshot,
            requireValue(snapshot.nodes[0])
        );

        scope.assert.equal(node.isStale, true);

        return scope.assert.collect();
    })
]);
