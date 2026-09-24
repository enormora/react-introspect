import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    introspectionComponentMetadata,
    introspectionValueMetadata,
    isIntrospectionRenderError,
    nextDepth,
    throwIntrospectionRenderError
} from './introspect-frame-contract.ts';

function catchThrown(value: unknown): unknown {
    try {
        throwIntrospectionRenderError(value);
    } catch (error) {
        return error;
    }

    throw new Error('Expected action to throw.');
}

export const testNode = suite('introspection frame contract', [
    test('creates public component metadata from React elements', function (scope) {
        const element = React.createElement('button', {
            children: 'Save',
            key: 'save',
            ref: 'legacy',
            title: 'Save'
        });
        const metadata = createComponentMetadata(element, 'depth', undefined, 'hidden');

        scope.assert.equal(metadata.activityMode, 'hidden');
        scope.assert.equal(metadata.givenChildren, 'Save');
        scope.assert.equal(metadata.key, 'save');
        scope.assert.deepEqual(metadata.props, { title: 'Save' });
        scope.assert.equal(metadata.renderedReason, 'depth');
        scope.assert.equal(metadata.type, 'button');

        return scope.assert.collect();
    }),
    test('wraps metadata and opaque values in internal hosts', function (scope) {
        const metadata = createComponentMetadata(React.createElement('span'), undefined);
        const componentHost = createComponentHost(metadata, 'child') as React.ReactElement<
            Readonly<Record<PropertyKey, unknown>>
        >;
        const emptyHost = createEmptyHost(null) as React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

        scope.assert.equal(componentHost.props[introspectionComponentMetadata], metadata);
        scope.assert.equal(emptyHost.props[introspectionValueMetadata], null);

        return scope.assert.collect();
    }),
    test('tracks render errors without marking thenables', function (scope) {
        const error = new Error('failed');
        const thenable = {
            then() {
                return undefined;
            }
        };

        scope.assert.equal(catchThrown(error), error);
        scope.assert.equal(catchThrown(thenable), thenable);
        scope.assert.equal(isIntrospectionRenderError(error), true);
        scope.assert.equal(isIntrospectionRenderError(thenable), false);

        return scope.assert.collect();
    }),
    test('decrements numeric depth and preserves full depth', function (scope) {
        scope.assert.equal(nextDepth('full'), 'full');
        scope.assert.equal(nextDepth(2), 1);
        scope.assert.equal(nextDepth(0), 0);

        return scope.assert.collect();
    })
]);
