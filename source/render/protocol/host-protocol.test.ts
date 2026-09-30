import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createActivityComponentHost,
    createCaughtErrorComponentHost,
    createEmptyHost,
    createExecutedComponentHost,
    createOpaqueHost,
    createUnexecutedComponentHost,
    type InternalHost,
    readInternalHost
} from './host-protocol.ts';

type HostElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>, string>;

type ComponentMetadata = Extract<InternalHost, { readonly kind: 'component'; }>['metadata'];

function readComponentMetadata(componentHost: React.ReactElement): ComponentMetadata {
    const { props, type } = componentHost as HostElement;
    const decoded = readInternalHost(type, props);

    if (decoded.kind !== 'component') {
        throw new Error('Expected a component host.');
    }

    return decoded.metadata;
}

export const testNode = suite('introspection host protocol', [
    test('encodes public component metadata for executed hosts', function (scope) {
        const element = React.createElement('button', {
            children: 'Save',
            key: 'save',
            ref: 'legacy',
            title: 'Save'
        });
        const metadata = readComponentMetadata(createExecutedComponentHost(element, 'child'));

        scope.assert.deepEqual(metadata, {
            activityMode: undefined,
            caughtError: undefined,
            givenChildren: 'Save',
            key: 'save',
            props: { title: 'Save' },
            renderStatus: { status: 'rendered' },
            type: 'button'
        });

        return scope.assert.collect();
    }),
    test('encodes the mode of Activity hosts', function (scope) {
        const metadata = readComponentMetadata(
            createActivityComponentHost(React.createElement('span'), 'hidden', 'child')
        );

        scope.assert.deepEqual(metadata, {
            activityMode: 'hidden',
            caughtError: undefined,
            givenChildren: undefined,
            key: null,
            props: {},
            renderStatus: { status: 'rendered' },
            type: 'span'
        });

        return scope.assert.collect();
    }),
    test('encodes the error a boundary host caught', function (scope) {
        const caughtError = { cause: new Error('Boom'), message: 'Boom' };
        const metadata = readComponentMetadata(
            createCaughtErrorComponentHost(React.createElement('span'), caughtError, 'child')
        );

        scope.assert.deepEqual(metadata, {
            activityMode: undefined,
            caughtError,
            givenChildren: undefined,
            key: null,
            props: {},
            renderStatus: { status: 'rendered' },
            type: 'span'
        });

        return scope.assert.collect();
    }),
    test('encodes why an unexecuted host did not render', function (scope) {
        const metadata = readComponentMetadata(createUnexecutedComponentHost(React.createElement('span'), 'depth'));

        scope.assert.deepEqual(metadata, {
            activityMode: undefined,
            caughtError: undefined,
            givenChildren: undefined,
            key: null,
            props: {},
            renderStatus: { reason: 'depth', status: 'notRendered' },
            type: 'span'
        });

        return scope.assert.collect();
    }),
    test('reads back the values it wraps in internal hosts', function (scope) {
        const emptyHost = createEmptyHost(null) as HostElement;
        const opaqueHost = createOpaqueHost(Symbol.iterator) as HostElement;

        scope.assert.deepEqual(readInternalHost(emptyHost.type, emptyHost.props), { kind: 'empty', value: null });
        scope.assert.deepEqual(readInternalHost(opaqueHost.type, opaqueHost.props), {
            kind: 'opaque',
            value: Symbol.iterator
        });
        scope.assert.deepEqual(readInternalHost('button', {}), { kind: 'host' });

        return scope.assert.collect();
    }),
    test('treats a copy of real component metadata as unsupported', function (scope) {
        const componentHost = createExecutedComponentHost(React.createElement('span'), 'child') as HostElement;
        const metadata = readComponentMetadata(componentHost);
        const forgedProps = Object.fromEntries(
            Object.entries(componentHost.props).map(function copyMetadata([ key, value ]) {
                return [ key, value === metadata ? { ...metadata } : value ];
            })
        );
        const decoded = readInternalHost(componentHost.type, forgedProps);
        const decodedRenderStatus: unknown = decoded.kind === 'component'
            ? decoded.metadata.renderStatus
            : decoded.kind;

        scope.assert.deepEqual(decodedRenderStatus, { reason: 'unsupported', status: 'notRendered' });

        return scope.assert.collect();
    })
]);
