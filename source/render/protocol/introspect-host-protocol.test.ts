import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    createOpaqueHost,
    readInternalHost
} from './introspect-host-protocol.ts';

type HostElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>, string>;

export const testNode = suite('introspection host protocol', [
    test('creates public component metadata from React elements', function (scope) {
        const element = React.createElement('button', {
            children: 'Save',
            key: 'save',
            ref: 'legacy',
            title: 'Save'
        });
        const metadata = createComponentMetadata({
            activityMode: 'hidden',
            caughtError: undefined,
            element,
            renderedReason: 'depth'
        });

        scope.assert.equal(metadata.activityMode, 'hidden');
        scope.assert.equal(metadata.givenChildren, 'Save');
        scope.assert.equal(metadata.key, 'save');
        scope.assert.deepEqual(metadata.props, { title: 'Save' });
        scope.assert.equal(metadata.renderedReason, 'depth');
        scope.assert.equal(metadata.type, 'button');

        return scope.assert.collect();
    }),
    test('reads back the metadata and values it wraps in internal hosts', function (scope) {
        const metadata = createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element: React.createElement('span'),
            renderedReason: undefined
        });
        const componentHost = createComponentHost(metadata, 'child') as HostElement;
        const emptyHost = createEmptyHost(null) as HostElement;
        const opaqueHost = createOpaqueHost(Symbol.iterator) as HostElement;

        scope.assert.deepEqual(readInternalHost(componentHost.type, componentHost.props), {
            kind: 'component',
            metadata
        });
        scope.assert.deepEqual(readInternalHost(emptyHost.type, emptyHost.props), { kind: 'empty', value: null });
        scope.assert.deepEqual(readInternalHost(opaqueHost.type, opaqueHost.props), {
            kind: 'opaque',
            value: Symbol.iterator
        });
        scope.assert.deepEqual(readInternalHost('button', {}), { kind: 'host' });

        return scope.assert.collect();
    }),
    test('treats a copy of real component metadata as unsupported', function (scope) {
        const metadata = createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element: React.createElement('span'),
            renderedReason: undefined
        });
        const componentHost = createComponentHost(metadata, 'child') as HostElement;
        const forgedProps = Object.fromEntries(
            Object.entries(componentHost.props).map(function copyMetadata([ key, value ]) {
                return [ key, value === metadata ? { ...metadata } : value ];
            })
        );
        const decoded = readInternalHost(componentHost.type, forgedProps);

        scope.assert.equal(
            decoded.kind === 'component' ? decoded.metadata.renderedReason : decoded.kind,
            'unsupported'
        );

        return scope.assert.collect();
    })
]);
