import { suite, test } from '@overkill-dev/test';
import React from 'react';
import {
    createIdNormalizer,
    normalizeSnapshotProps,
    normalizeSnapshotValue
} from './id-normalization.ts';

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
    test('asks the generator once per generated id', function (scope) {
        const requestedIds: string[] = [];
        const normalizeId = createIdNormalizer({
            generator(generatedId) {
                requestedIds.push(generatedId);

                return `id-${requestedIds.length}`;
            },
            prefix: 'test-'
        });

        scope.assert.equal(normalizeId('_test-r_a_ _test-r_b_ _test-r_a_'), 'id-1 id-2 id-1');
        scope.assert.equal(normalizeId('_test-r_b_'), 'id-2');
        scope.assert.deepEqual(requestedIds, [ '_test-r_a_', '_test-r_b_' ]);

        return scope.assert.collect();
    }),
    test('matches an id prefix containing regular expression syntax literally', function (scope) {
        const normalizeId = createIdNormalizer({
            generator() {
                return 'stable-id';
            },
            prefix: 'x.1+(2)'
        });

        scope.assert.equal(normalizeId('_x.1+(2)r_a_'), 'stable-id');
        scope.assert.equal(normalizeId('_xy112r_a_'), '_xy112r_a_');
        scope.assert.equal(normalizeId('_xy1+(2)r_a_'), '_xy1+(2)r_a_');

        return scope.assert.collect();
    }),
    test('normalizes strings directly on props and replaces elements inside plain containers', function (scope) {
        const config = { theme: 'dark' };
        const normalized = normalizeSnapshotProps(
            {
                element: React.createElement('label', { htmlFor: '_test-r_a_' }),
                id: '_test-r_a_',
                nested: [ { config, icon: React.createElement('svg', { id: '_test-r_a_' }) } ]
            },
            {
                ancestors: new WeakSet(),
                describeElement(element, location) {
                    return { location, props: element.props, type: element.type };
                },
                normalizeIdString: createIdNormalizer({
                    generator() {
                        return 'stable-id';
                    },
                    prefix: 'test-'
                })
            }
        );
        const nested = normalized.nested as readonly Readonly<Record<string, unknown>>[];

        scope.assert.deepEqual(normalized, {
            element: {
                location: 'element',
                props: { htmlFor: '_test-r_a_' },
                type: 'label'
            },
            id: 'stable-id',
            nested: [ { config, icon: { location: 'nested.0.icon', props: { id: '_test-r_a_' }, type: 'svg' } } ]
        });
        scope.assert.equal(Object.isFrozen(nested), true);
        scope.assert.equal(Object.isFrozen(nested[0]), true);
        scope.assert.equal(nested[0]?.config, config);

        return scope.assert.collect();
    }),
    test('keeps values without elements by reference', function (scope) {
        const cyclic: Record<string, unknown> = { id: '_test-r_a_' };

        cyclic.self = cyclic;

        const props = {
            createdAt: new Date(0),
            cyclic,
            list: [ { id: '_test-r_a_' } ],
            lookup: new Map([ [ 'id', '_test-r_a_' ] ]),
            record: { id: '_test-r_a_' },
            set: new Set([ '_test-r_a_' ])
        };
        const normalized = normalizeSnapshotProps(props, {
            ancestors: new WeakSet(),
            describeElement() {
                throw new Error('Expected no element.');
            },
            normalizeIdString: createIdNormalizer({
                generator() {
                    return 'stable-id';
                },
                prefix: 'test-'
            })
        });

        scope.assert.deepEqual({
            createdAt: normalized.createdAt === props.createdAt,
            cyclic: normalized.cyclic === props.cyclic,
            list: normalized.list === props.list,
            lookup: normalized.lookup === props.lookup,
            record: normalized.record === props.record,
            recordFrozen: Object.isFrozen(normalized.record),
            set: normalized.set === props.set
        }, {
            createdAt: true,
            cyclic: true,
            list: true,
            lookup: true,
            record: true,
            recordFrozen: false,
            set: true
        });

        return scope.assert.collect();
    }),
    test('cuts cycles inside containers that hold elements', function (scope) {
        const value: Record<string, unknown> = { icon: React.createElement('svg') };

        value.self = value;
        value.inner = { back: value };

        const normalized = normalizeSnapshotProps({ value }, {
            ancestors: new WeakSet(),
            describeElement(element) {
                return element.type;
            },
            normalizeIdString: String
        });

        scope.assert.deepEqual(normalized, {
            value: {
                icon: 'svg',
                inner: { back: '[Circular]' },
                self: '[Circular]'
            }
        });

        return scope.assert.collect();
    }),
    test('describes elements inside leaf values as plain data', function (scope) {
        const list = [ 1 ];
        const plain = { list };

        scope.assert.deepEqual(
            normalizeSnapshotValue(
                { element: React.createElement('b', { title: 'plain' }, React.createElement('i')), plain },
                String
            ),
            {
                element: {
                    key: null,
                    props: { children: { key: null, props: {}, type: 'i' }, title: 'plain' },
                    type: 'b'
                },
                plain
            }
        );
        scope.assert.equal(normalizeSnapshotValue(plain, String), plain);
        scope.assert.equal(
            normalizeSnapshotValue(
                '_test-r_a_',
                createIdNormalizer({
                    generator() {
                        return 'stable-id';
                    },
                    prefix: 'test-'
                })
            ),
            'stable-id'
        );

        return scope.assert.collect();
    })
]);
