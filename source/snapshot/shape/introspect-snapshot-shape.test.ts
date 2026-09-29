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
        render: { status: 'rendered', visibility: 'visible' },
        textContent,
        type: '#text'
    };
}

function createShownComponent(): () => React.ReactNode {
    return Object.assign(function ComponentWithDisplayName(): React.ReactNode {
        return null;
    }, {
        displayName: 'ShownComponent'
    });
}

function Label(): React.ReactNode {
    return null;
}

function InputComponent(): React.ReactNode {
    return null;
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
    }),
    test('names memo components after the component they wrap', function (scope) {
        scope.assert.equal(getTypeName(React.memo(Label)), 'Label');
        scope.assert.equal(getTypeName(React.memo(React.forwardRef(InputComponent))), 'ForwardRef(InputComponent)');
        scope.assert.equal(
            getTypeName(React.memo(function () {
                return null;
            })),
            'Memo'
        );

        return scope.assert.collect();
    }),
    test('names forwardRef components after their render function', function (scope) {
        scope.assert.equal(getTypeName(React.forwardRef(InputComponent)), 'ForwardRef(InputComponent)');
        scope.assert.equal(
            getTypeName(React.forwardRef(function () {
                return null;
            })),
            'ForwardRef'
        );

        return scope.assert.collect();
    }),
    test('prefers the display name of memo and forwardRef wrappers', function (scope) {
        scope.assert.equal(getTypeName(Object.assign(React.memo(Label), { displayName: 'ShownMemo' })), 'ShownMemo');
        scope.assert.equal(
            getTypeName(Object.assign(React.forwardRef(InputComponent), { displayName: 'ShownInput' })),
            'ShownInput'
        );
        scope.assert.equal(getTypeName(Object.assign(React.memo(Label), { displayName: '' })), 'Label');

        return scope.assert.collect();
    })
]);
