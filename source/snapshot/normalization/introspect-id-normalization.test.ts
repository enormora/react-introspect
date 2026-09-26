import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createIdNormalizer,
    normalizeSnapshotProps,
    normalizeSnapshotValue
} from './introspect-id-normalization.ts';

export const testNode = suite('introspection id normalization', [
    test('replaces generated React ids consistently', function (scope) {
        const normalizeId = createIdNormalizer({
            generator(generatedId) {
                return generatedId.endsWith('_a_') ? 'first-id' : 'next-id';
            },
            prefix: 'test-'
        });

        scope.assert.equal(normalizeId('before _test-r_a_ after _test-r_b_'), 'before first-id after next-id');
        scope.assert.equal(normalizeId('_test-r_a_'), 'first-id');

        return scope.assert.collect();
    }),
    test('normalizes props, React elements, and circular values', function (scope) {
        const value: Record<string, unknown> = { id: '_test-r_a_' };

        value.self = value;

        const normalized = normalizeSnapshotProps(
            {
                element: React.createElement('label', { htmlFor: '_test-r_a_' }),
                nested: [ { icon: React.createElement('svg', { id: '_test-r_a_' }) } ],
                value
            },
            {
                ancestors: new WeakSet(),
                describeElement(element, location, normalizeElementProps) {
                    return { location, props: normalizeElementProps(), type: element.type };
                },
                normalizeIdString: createIdNormalizer({
                    generator() {
                        return 'stable-id';
                    },
                    prefix: 'test-'
                })
            }
        );

        scope.assert.deepEqual(normalized, {
            element: {
                location: 'element',
                props: { htmlFor: 'stable-id' },
                type: 'label'
            },
            nested: [ { icon: { location: 'nested.0.icon', props: { id: 'stable-id' }, type: 'svg' } } ],
            value: {
                id: 'stable-id',
                self: '[Circular]'
            }
        });
        scope.assert.deepEqual(
            normalizeSnapshotValue(React.createElement('b', { title: 'plain' }), String),
            { key: null, props: { title: 'plain' }, type: 'b' }
        );
        scope.assert.equal(
            normalizeSnapshotValue('unchanged', function (valueToNormalize) {
                return valueToNormalize;
            }),
            'unchanged'
        );

        return scope.assert.collect();
    })
]);
