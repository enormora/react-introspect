import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { SnapshotNode } from '../model/introspect-snapshot-contract.ts';
import {
    freezePublicElementProps,
    getElementKind,
    getIndexedPath,
    getTextContent,
    getTypeName
} from './introspect-snapshot-shape.ts';

function createTextNode(textContent: string): SnapshotNode {
    return {
        activityMode: undefined,
        caughtError: undefined,
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
        scope.assert.deepEqual(freezePublicElementProps({ children: 'ignored', key: 'k', ref: 'r', title: 'Save' }), {
            title: 'Save'
        });
        scope.assert.equal(getIndexedPath('root', 0, 'button'), 'button');
        scope.assert.equal(getIndexedPath('form', 1, 'button'), 'form > button[1]');
        scope.assert.equal(getElementKind('button'), 'host');
        scope.assert.equal(getElementKind(React.Fragment), 'fragment');

        return scope.assert.collect();
    }),
    test('names components by their display name', function (scope) {
        const shownComponent = createShownComponent();

        scope.assert.equal(getTypeName(shownComponent), 'ShownComponent');

        return scope.assert.collect();
    })
]);
