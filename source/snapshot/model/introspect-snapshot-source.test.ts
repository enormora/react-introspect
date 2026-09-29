import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { isObject } from '../../values/introspect-value-kinds.ts';
import { createIntrospectionSnapshotFromSource, toSnapshotSourceNodes } from './introspect-snapshot.ts';
import { isSnapshotNode, type SnapshotNode } from './introspect-snapshot-contract.ts';

function Icon(): React.ReactNode {
    return null;
}

function describeValue(value: unknown): unknown {
    if (isSnapshotNode(value)) {
        return `#${value.id}`;
    }

    if (Array.isArray(value)) {
        return value.map(describeValue);
    }

    if (isObject(value)) {
        return Object.fromEntries(
            Object.entries(value).map(function describeEntry([ key, entry ]) {
                return [ key, describeValue(entry) ];
            })
        );
    }

    return typeof value === 'bigint' ? `${value}n` : value;
}

function readIds(nodes: readonly SnapshotNode[]): string {
    return nodes
        .map(function readId(node) {
            return node.id;
        })
        .join(',');
}

function describeNode(node: SnapshotNode): string {
    return [
        `#${node.id}<${String(node.parentId)}`,
        node.kind,
        node.name,
        `key=${String(node.key)}`,
        `path=${node.path}`,
        `given=[${readIds(node.givenChildren)}]`,
        `rendered=[${readIds(node.renderedChildren)}]`,
        `reason=${String(node.renderedReason)}`,
        `text=${JSON.stringify(node.textContent)}`,
        node.visibility,
        `props=${JSON.stringify(describeValue(node.props))}`
    ]
        .join(' ');
}

function createGivenChildren(): readonly unknown[] {
    return [
        'text',
        5,
        7n,
        null,
        false,
        React.createElement('em', { key: 'k', ref: { current: null }, title: 'emphasis' }, 'x-'),
        [ React.createElement('b', { key: 'b' }), [ React.createElement('i', { key: 'i' }) ] ],
        new Set([ 'from-iterable' ]),
        React.createElement(Icon, { label: 'nested' }, React.createElement('span', null, 'inside')),
        { opaque: true }
    ];
}

export const testNode = suite('snapshots of given children and elements in props', [
    test('builds given children and prop elements with stable ids, paths and props', function (scope) {
        const snapshot = createIntrospectionSnapshotFromSource(
            [
                {
                    activityMode: 'hidden',
                    children: [],
                    caughtError: undefined,
                    givenChildren: toSnapshotSourceNodes(createGivenChildren()),
                    kind: 'element',
                    key: 'panel',
                    props: {
                        icon: React.createElement(Icon, { key: 'icon', label: 'prop' }, 'label text'),
                        list: [ React.createElement('li', { key: 'first' }, 1) ]
                    },
                    renderedReason: 'depth',
                    type: Icon,
                    visibility: 'visible'
                }
            ],
            1,
            { generator: undefined, prefix: '' }
        );

        scope.assert.deepEqual(snapshot.nodes.map(describeNode), [
            '#1<0 text #text key=null path=Icon > #text[0] given=[] rendered=[] reason=undefined text="text" hidden props={"value":"text"}',
            '#2<0 text #text key=null path=Icon > #text[1] given=[] rendered=[] reason=undefined text="5" hidden props={"value":5}',
            '#3<0 text #text key=null path=Icon > #text[2] given=[] rendered=[] reason=undefined text="7" hidden props={"value":"7n"}',
            '#4<0 empty #empty key=null path=Icon > #empty[3] given=[] rendered=[] reason=undefined text="" hidden props={"value":null}',
            '#5<0 empty #empty key=null path=Icon > #empty[4] given=[] rendered=[] reason=undefined text="" hidden props={"value":false}',
            '#7<6 text #text key=null path=Icon > em[5] > #text[0] given=[] rendered=[] reason=undefined text="x-" hidden props={"value":"x-"}',
            '#6<0 host em key=k path=Icon > em[5] given=[7] rendered=[7] reason=undefined text="x-" hidden props={"ref":{"current":null},"title":"emphasis"}',
            '#9<8 empty #empty key=null path=Icon > b[6] > #empty[0] given=[] rendered=[] reason=undefined text="" hidden props={}',
            '#8<0 host b key=b path=Icon > b[6] given=[9] rendered=[9] reason=undefined text="" hidden props={}',
            '#11<10 empty #empty key=null path=Icon > i[7] > #empty[0] given=[] rendered=[] reason=undefined text="" hidden props={}',
            '#10<0 host i key=i path=Icon > i[7] given=[11] rendered=[11] reason=undefined text="" hidden props={}',
            '#12<0 text #text key=null path=Icon > #text[8] given=[] rendered=[] reason=undefined text="from-iterable" hidden props={"value":"from-iterable"}',
            '#15<14 text #text key=null path=Icon > Icon[9] > span[0] > #text[0] given=[] rendered=[] reason=undefined text="inside" hidden props={"value":"inside"}',
            '#14<13 host span key=null path=Icon > Icon[9] > span[0] given=[15] rendered=[15] reason=undefined text="inside" hidden props={}',
            '#13<0 component Icon key=null path=Icon > Icon[9] given=[14] rendered=[14] reason=depth text="inside" hidden props={"label":"nested"}',
            '#16<0 opaque Opaque key=null path=Icon > Opaque[10] given=[] rendered=[] reason=unsupported text="" hidden props={"value":{"opaque":true}}',
            '#18<17 text #text key=null path=Icon > Icon[icon] > #text[0] given=[] rendered=[] reason=undefined text="label text" hidden props={"value":"label text"}',
            '#17<0 component Icon key=icon path=Icon > Icon[icon] given=[18] rendered=[18] reason=depth text="label text" hidden props={"label":"prop"}',
            '#20<19 text #text key=null path=Icon > li[list.0] > #text[0] given=[] rendered=[] reason=undefined text="1" hidden props={"value":1}',
            '#19<0 host li key=first path=Icon > li[list.0] given=[20] rendered=[20] reason=undefined text="1" hidden props={}',
            '#0<undefined component Icon key=panel path=Icon given=[1,2,3,4,5,6,8,10,12,13,16] rendered=[1,2,3,4,5,6,8,10,12,13,16] reason=depth text="text57x-from-iterableinside" hidden props={"icon":"#17","list":["#19"]}'
        ]);

        return scope.assert.collect();
    })
]);
