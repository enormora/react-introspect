import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    introspectionComponentMetadata,
    introspectionValueMetadata
} from './introspect-frame-contract.ts';

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
    })
]);
