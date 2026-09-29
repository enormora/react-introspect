import { suite, test } from '@overkill-dev/test';
import { readPublicProps } from './introspect-public-props.ts';

const internalKey = Symbol('internal');

export const testNode = suite('public props', [
    test('drops React reserved keys', function (scope) {
        scope.assert.deepEqual(readPublicProps({ children: 'ignored', key: 'k', ref: 'r', title: 'Save' }, new Set()), {
            title: 'Save'
        });

        return scope.assert.collect();
    }),
    test('drops the internal keys a caller names', function (scope) {
        scope.assert.deepEqual(
            readPublicProps({ [internalKey]: 'hidden', internal: 'kept', title: 'Save' }, new Set([ internalKey ])),
            { internal: 'kept', title: 'Save' }
        );

        return scope.assert.collect();
    }),
    test('keeps public props with symbol keys', function (scope) {
        const publicKey = Symbol('public');

        scope.assert.deepEqual(readPublicProps({ [publicKey]: 'kept' }, new Set()), { [publicKey]: 'kept' });

        return scope.assert.collect();
    }),
    test('returns a frozen copy', function (scope) {
        const props = { title: 'Save' };
        const publicProps = readPublicProps(props, new Set());

        scope.assert.equal(Object.isFrozen(publicProps), true);
        scope.assert.equal(publicProps === props, false);

        return scope.assert.collect();
    })
]);
