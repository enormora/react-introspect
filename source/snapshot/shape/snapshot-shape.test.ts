import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { SnapshotNode } from '../model/snapshot-contract.ts';
import {
    getElementKind,
    getIndexedPath,
    getTextContent,
    getTypeName
} from './snapshot-shape.ts';

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

const lazyInitializerKey = '_init';
const lazyPayloadKey = '_payload';

function failToInitialize(): never {
    throw new Error('naming must not initialize a lazy component');
}

function createLazyType(payload: unknown): unknown {
    return {
        $$typeof: Symbol.for('react.lazy'),
        [lazyInitializerKey]: failToInitialize,
        [lazyPayloadKey]: payload
    };
}

function createResolvedLazyLabel(): unknown {
    return createLazyType({ _result: { default: Label }, _status: 1 });
}

function createPendingLazyType(): unknown {
    return createLazyType({ _result: undefined, _status: 0 });
}

function createMemoType(inner: unknown): unknown {
    return { $$typeof: Symbol.for('react.memo'), type: inner };
}

export const testNode = suite('introspection snapshot shape', [
    test('derives text, paths, and element kinds', function (scope) {
        const children = [ createTextNode('Save'), createTextNode(' now') ];

        scope.assert.equal(getTextContent(children), 'Save now');
        scope.assert.equal(getIndexedPath('root', 0, 'button'), 'button');
        scope.assert.equal(getIndexedPath('form', 1, 'button'), 'form > button[1]');
        scope.assert.equal(getElementKind('button'), 'host');
        scope.assert.equal(getElementKind(React.Fragment), 'fragment');

        return scope.assert.collect();
    }),
    test('names components by their display name', function (scope) {
        const shownComponent = createShownComponent();

        scope.assert.equal(getTypeName(shownComponent, 'executed'), 'ShownComponent');

        return scope.assert.collect();
    }),
    test('names memo components after the component they wrap', function (scope) {
        scope.assert.equal(getTypeName(React.memo(Label), 'executed'), 'Label');
        scope.assert.equal(
            getTypeName(React.memo(React.forwardRef(InputComponent)), 'executed'),
            'ForwardRef(InputComponent)'
        );
        scope.assert.equal(
            getTypeName(
                React.memo(function () {
                    return null;
                }),
                'executed'
            ),
            'Memo'
        );

        return scope.assert.collect();
    }),
    test('names forwardRef components after their render function', function (scope) {
        scope.assert.equal(getTypeName(React.forwardRef(InputComponent), 'executed'), 'ForwardRef(InputComponent)');
        scope.assert.equal(
            getTypeName(
                React.forwardRef(function () {
                    return null;
                }),
                'executed'
            ),
            'ForwardRef'
        );

        return scope.assert.collect();
    }),
    test('prefers the display name of memo and forwardRef wrappers', function (scope) {
        scope.assert.equal(
            getTypeName(Object.assign(React.memo(Label), { displayName: 'ShownMemo' }), 'executed'),
            'ShownMemo'
        );
        scope.assert.equal(
            getTypeName(Object.assign(React.forwardRef(InputComponent), { displayName: 'ShownInput' }), 'executed'),
            'ShownInput'
        );
        scope.assert.equal(getTypeName(Object.assign(React.memo(Label), { displayName: '' }), 'executed'), 'Label');

        return scope.assert.collect();
    }),
    test('names lazy components after the component they resolved to', function (scope) {
        scope.assert.equal(getTypeName(createResolvedLazyLabel(), 'executed'), 'Label');
        scope.assert.equal(getTypeName(createMemoType(createResolvedLazyLabel()), 'executed'), 'Label');
        scope.assert.equal(getTypeName(createPendingLazyType(), 'executed'), 'Component');
        scope.assert.equal(getTypeName(createLazyType({ _result: undefined, _status: 1 }), 'executed'), 'Component');
        scope.assert.equal(getTypeName(createResolvedLazyLabel(), 'unexecuted'), 'Component');
        scope.assert.equal(getTypeName(createMemoType(createResolvedLazyLabel()), 'unexecuted'), 'Memo');

        return scope.assert.collect();
    }),
    test('names a pending lazy component without starting to load it', function (scope) {
        const loads: string[] = [];
        const PendingPage = React.lazy(async function loadPage() {
            loads.push('load');

            return { default: Label };
        });

        scope.assert.equal(getTypeName(PendingPage, 'executed'), 'Component');
        scope.assert.deepEqual(loads, []);

        return scope.assert.collect();
    }),
    test('names memo components without a known inner name Memo', function (scope) {
        scope.assert.equal(getTypeName(createMemoType({}), 'executed'), 'Memo');
        scope.assert.equal(getTypeName(createMemoType(createPendingLazyType()), 'executed'), 'Memo');

        return scope.assert.collect();
    })
]);
