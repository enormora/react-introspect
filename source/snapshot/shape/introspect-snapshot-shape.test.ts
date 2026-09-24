import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { SnapshotNode } from '../model/introspect-snapshot-contract.ts';
import {
    freezePropsWithoutChildren,
    getElementChildrenState,
    getElementKind,
    getIndexedPath,
    getSourceElementKind,
    getTextContent,
    getTypeName
} from './introspect-snapshot-shape.ts';

function createTextNode(textContent: string): SnapshotNode {
    return {
        activityMode: undefined,
        error: undefined,
        givenChildren: [],
        id: 1,
        key: null,
        kind: 'text',
        name: '#text',
        parentId: undefined,
        path: '#text',
        props: {},
        renderedChildren: [],
        renderedReason: undefined,
        textContent,
        type: '#text',
        visibility: 'visible'
    };
}

function NamedComponent(): React.ReactNode {
    return null;
}

Reflect.set(NamedComponent, 'displayName', 'ShownComponent');

export const testNode = suite('introspection snapshot shape', [
    test('derives text, public props, paths, and element kinds', function (scope) {
        const children = [ createTextNode('Save'), createTextNode(' now') ];

        scope.assert.equal(getTextContent(children), 'Save now');
        scope.assert.deepEqual(freezePropsWithoutChildren({ children: 'ignored', key: 'k', title: 'Save' }), {
            title: 'Save'
        });
        scope.assert.equal(getIndexedPath('root', 0, 'button'), 'button');
        scope.assert.equal(getIndexedPath('form', 1, 'button'), 'form > button[1]');
        scope.assert.equal(getElementKind('button'), 'host');
        scope.assert.equal(getElementKind(React.Fragment), 'fragment');
        scope.assert.equal(
            getSourceElementKind({
                activityMode: undefined,
                children: [],
                error: undefined,
                givenChildren: [],
                givenChildrenKind: 'source',
                key: null,
                props: {},
                renderedReason: undefined,
                type: 'button',
                visibility: 'visible'
            }),
            'host'
        );

        return scope.assert.collect();
    }),
    test('marks component children as not rendered at shallow depth', function (scope) {
        const child = createTextNode('child');
        const hostState = getElementChildrenState('button', [ child ]);
        const componentState = getElementChildrenState(NamedComponent, [ child ]);

        scope.assert.equal(hostState.renderedChildren.length, 1);
        scope.assert.equal(hostState.renderedReason, undefined);
        scope.assert.equal(componentState.renderedChildren.length, 0);
        scope.assert.equal(componentState.renderedReason, 'depth');
        scope.assert.equal(componentState.textContent, 'child');
        scope.assert.equal(getTypeName(NamedComponent), 'ShownComponent');

        return scope.assert.collect();
    })
]);
