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

function createShownComponent(): () => React.ReactNode {
    return Object.assign(function ComponentWithDisplayName(): React.ReactNode {
        return null;
    }, {
        displayName: 'ShownComponent'
    });
}

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
        const shownComponent = createShownComponent();
        const child = createTextNode('child');
        const hostState = getElementChildrenState('button', [ child ]);
        const componentState = getElementChildrenState(shownComponent, [ child ]);

        scope.assert.deepEqual({
            componentRenderedChildren: componentState.renderedChildren.length,
            componentRenderedReason: componentState.renderedReason,
            componentTextContent: componentState.textContent,
            hostRenderedChildren: hostState.renderedChildren.length,
            hostRenderedReason: hostState.renderedReason
        }, {
            componentRenderedChildren: 0,
            componentRenderedReason: 'depth',
            componentTextContent: 'child',
            hostRenderedChildren: 1,
            hostRenderedReason: undefined
        });
        scope.assert.equal(getTypeName(shownComponent), 'ShownComponent');

        return scope.assert.collect();
    })
]);
