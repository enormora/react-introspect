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
        `render=${
            JSON.stringify(
                node.render,
                Object.keys(node.render).toSorted(function compareKeys(left, right) {
                    return left.localeCompare(right);
                })
            )
        }`,
        `text=${JSON.stringify(node.textContent)}`,
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
                    hostVisibility: 'visible',
                    kind: 'element',
                    key: 'panel',
                    props: {
                        icon: React.createElement(Icon, { key: 'icon', label: 'prop' }, 'label text'),
                        list: [ React.createElement('li', { key: 'first' }, 1) ]
                    },
                    renderedReason: 'depth',
                    type: Icon
                }
            ],
            1,
            { generator: undefined, prefix: '' }
        );

        scope.assert.deepEqual(snapshot.nodes.map(describeNode), [
            '#1<0 text #text key=null path=Icon > #text[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="text" props={"value":"text"}',
            '#2<0 text #text key=null path=Icon > #text[1] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="5" props={"value":5}',
            '#3<0 text #text key=null path=Icon > #text[2] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="7" props={"value":"7n"}',
            '#4<0 empty #empty key=null path=Icon > #empty[3] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={"value":null}',
            '#5<0 empty #empty key=null path=Icon > #empty[4] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={"value":false}',
            '#7<6 text #text key=null path=Icon > em[5] > #text[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="x-" props={"value":"x-"}',
            '#6<0 host em key=k path=Icon > em[5] given=[7] rendered=[7] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="x-" props={"title":"emphasis"}',
            '#9<8 empty #empty key=null path=Icon > b[6] > #empty[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={}',
            '#8<0 host b key=b path=Icon > b[6] given=[9] rendered=[9] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={}',
            '#11<10 empty #empty key=null path=Icon > i[7] > #empty[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={}',
            '#10<0 host i key=i path=Icon > i[7] given=[11] rendered=[11] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="" props={}',
            '#12<0 text #text key=null path=Icon > #text[8] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="from-iterable" props={"value":"from-iterable"}',
            '#15<14 text #text key=null path=Icon > Icon[9] > span[0] > #text[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="inside" props={"value":"inside"}',
            '#14<13 host span key=null path=Icon > Icon[9] > span[0] given=[15] rendered=[15] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="inside" props={}',
            '#13<0 component Icon key=null path=Icon > Icon[9] given=[14] rendered=[14] render={"hiddenBy":"activity","reason":"depth","status":"notRendered","visibility":"hidden"} text="inside" props={"label":"nested"}',
            '#16<0 opaque Opaque key=null path=Icon > Opaque[10] given=[] rendered=[] render={"reason":"unsupported","status":"notRendered"} text="" props={"value":{"opaque":true}}',
            '#18<17 text #text key=null path=Icon > Icon[icon] > #text[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="label text" props={"value":"label text"}',
            '#17<0 component Icon key=icon path=Icon > Icon[icon] given=[18] rendered=[18] render={"hiddenBy":"activity","reason":"depth","status":"notRendered","visibility":"hidden"} text="label text" props={"label":"prop"}',
            '#20<19 text #text key=null path=Icon > li[list.0] > #text[0] given=[] rendered=[] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="1" props={"value":1}',
            '#19<0 host li key=first path=Icon > li[list.0] given=[20] rendered=[20] render={"hiddenBy":"activity","status":"rendered","visibility":"hidden"} text="1" props={}',
            '#0<undefined component Icon key=panel path=Icon given=[1,2,3,4,5,6,8,10,12,13,16] rendered=[1,2,3,4,5,6,8,10,12,13,16] render={"hiddenBy":"activity","reason":"depth","status":"notRendered","visibility":"hidden"} text="text57x-from-iterableinside" props={"icon":"#17","list":["#19"]}'
        ]);

        return scope.assert.collect();
    })
]);
