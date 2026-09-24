import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import { createIntrospectionView as introspect } from '../../runtime/view/introspect-view.ts';
import { normalizeSnapshotValue } from '../../snapshot/normalization/introspect-id-normalization.ts';

type ElementProp = {
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly type: unknown;
};

type LeafProps = {
    readonly icon: React.ReactElement;
    readonly metadata: {
        readonly label: string;
        readonly self: unknown;
    };
};

const actEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';
const reactPortalType = Symbol.for('react.portal');
const browserGlobalKeys = Object.freeze([
    'document',
    'window'
]);

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function createPortalValue(children: React.ReactNode): React.ReactElement {
    return Object.freeze({
        $$typeof: reactPortalType,
        children,
        containerInfo: Object.freeze({}),
        implementation: null,
        key: null
    }) as unknown as React.ReactElement;
}

function createPortalArray(): readonly React.ReactNode[] {
    return Object.freeze([
        createPortalValue(React.createElement('span', null, 'portal'))
    ]);
}

function PortalOutput(): React.ReactNode {
    return createPortalValue(React.createElement('span', null, 'portal'));
}

function Leaf(props: LeafProps): React.ReactNode {
    Reflect.ownKeys(props);

    return null;
}

function Icon(): React.ReactNode {
    return null;
}

function ElementPropRoot(): React.ReactNode {
    const metadata: Record<PropertyKey, unknown> = {
        label: 'details'
    };

    metadata.self = metadata;

    return React.createElement(Leaf, {
        icon: React.createElement(Icon, { title: 'info' }),
        metadata: metadata as LeafProps['metadata']
    });
}

function PortalArrayChildRoot(): React.ReactNode {
    return React.createElement(Leaf, {
        icon: React.createElement(Icon),
        metadata: {
            label: 'portal-child',
            self: undefined
        }
    }, createPortalArray());
}

function readElementProp(node: IntrospectionNode): ElementProp {
    const { icon } = node.props as Readonly<Record<PropertyKey, unknown>>;

    if (!isRecord(icon)) {
        throw new Error('Expected icon prop to be normalized.');
    }

    return icon as ElementProp;
}

const assertPublicOutputIsIntrospectionOwned = defineCompositeAssertion({
    assert(check) {
        const leaf = requireValue(introspect(React.createElement(ElementPropRoot)).find(Leaf));
        const icon = readElementProp(leaf);
        const serialized = requireValue(JSON.stringify(leaf));

        return check.group([
            check.annotated('icon type').equal(icon.type, Icon),
            check.annotated('icon props').deepEqual(icon.props, {
                title: 'info'
            }),
            check.annotated('metadata').deepEqual(leaf.props.metadata, {
                label: 'details',
                self: '[Circular]'
            }),
            check.annotated('serialized type').string(serialized),
            check.annotated('component name').match(serialized, /"name":"Leaf"/u),
            check.annotated('reflect marker').false(serialized.includes('__reactReflect')),
            check.annotated('internal marker').false(serialized.includes('react-introspect-internal')),
            check.annotated('react type marker').false(serialized.includes('$$typeof')),
            check.annotated('react owner').false(serialized.includes('_owner')),
            check.annotated('react store').false(serialized.includes('_store'))
        ]);
    },
    name: 'assertPublicOutputIsIntrospectionOwned'
});

const assertPortalRootFails = defineCompositeAssertion({
    assert(check) {
        return check.throws(
            function () {
                introspect(createPortalValue(React.createElement('span', null, 'root')));
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
    },
    name: 'assertPortalRootFails'
});

const assertPortalOutputFails = defineCompositeAssertion({
    assert(check) {
        return check.throws(
            function () {
                introspect(React.createElement(PortalOutput), {
                    depth: 'full',
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
    },
    name: 'assertPortalOutputFails'
});

const assertPortalChildFails = defineCompositeAssertion({
    assert(check) {
        return check.throws(
            function () {
                introspect(React.createElement(PortalArrayChildRoot), {
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
    },
    name: 'assertPortalChildFails'
});

const assertPortalNormalizationFails = defineCompositeAssertion({
    assert(check) {
        return check.throws(
            function () {
                normalizeSnapshotValue(
                    createPortalValue(React.createElement('span', null, 'portal')),
                    String
                );
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
    },
    name: 'assertPortalNormalizationFails'
});

const assertCircularArrayNormalization = defineCompositeAssertion({
    assert(check) {
        const value: unknown[] = [];

        value.push(value);

        return check.deepEqual(normalizeSnapshotValue(value, String), [
            '[Circular]'
        ]);
    },
    name: 'assertCircularArrayNormalization'
});

function installThrowingBrowserGlobals(): () => void {
    const originals = browserGlobalKeys.map(function readOriginal(key) {
        return Object.freeze({
            descriptor: Object.getOwnPropertyDescriptor(globalThis, key),
            key
        });
    });

    for (const key of browserGlobalKeys) {
        Object.defineProperty(globalThis, key, {
            configurable: true,
            get() {
                throw new Error(`Unexpected browser global read: ${key}`);
            }
        });
    }

    return function restoreBrowserGlobals() {
        for (const original of originals) {
            if (original.descriptor === undefined) {
                Reflect.deleteProperty(globalThis, original.key);
            } else {
                Object.defineProperty(globalThis, original.key, original.descriptor);
            }
        }
    };
}

const assertBrowserGlobalsAreNotRequired = defineCompositeAssertion({
    assert(check) {
        const restoreBrowserGlobals = installThrowingBrowserGlobals();

        try {
            const view = introspect(React.createElement('main', null, 'server-safe'));

            return check.equal(view.textContent, 'server-safe');
        } finally {
            restoreBrowserGlobals();
        }
    },
    name: 'assertBrowserGlobalsAreNotRequired'
});

const assertActEnvironmentRestored = defineCompositeAssertion({
    assert(check) {
        const hadActEnvironment = Object.hasOwn(globalThis, actEnvironmentKey);
        const previousActEnvironment: unknown = Reflect.get(globalThis, actEnvironmentKey);

        try {
            introspect(React.createElement('main', null, 'clean'));

            return check.group([
                check.annotated('own act environment').equal(
                    Object.hasOwn(globalThis, actEnvironmentKey),
                    hadActEnvironment
                ),
                check.annotated('act environment value').equal(
                    Reflect.get(globalThis, actEnvironmentKey),
                    previousActEnvironment
                )
            ]);
        } finally {
            if (hadActEnvironment) {
                Reflect.set(globalThis, actEnvironmentKey, previousActEnvironment);
            } else {
                Reflect.deleteProperty(globalThis, actEnvironmentKey);
            }
        }
    },
    name: 'assertActEnvironmentRestored'
});

const assertExistingActEnvironmentRestored = defineCompositeAssertion({
    assert(check) {
        const hadActEnvironment = Object.hasOwn(globalThis, actEnvironmentKey);
        const previousActEnvironment: unknown = Reflect.get(globalThis, actEnvironmentKey);

        try {
            Reflect.set(globalThis, actEnvironmentKey, 'existing');
            introspect(React.createElement('main', null, 'clean'));

            return check.equal(Reflect.get(globalThis, actEnvironmentKey), 'existing');
        } finally {
            if (hadActEnvironment) {
                Reflect.set(globalThis, actEnvironmentKey, previousActEnvironment);
            } else {
                Reflect.deleteProperty(globalThis, actEnvironmentKey);
            }
        }
    },
    name: 'assertExistingActEnvironmentRestored'
});

export const testNode = suite('unsupported React concepts and hardening', [
    test('fails clearly for portal roots', function (scope) {
        scope.assert(assertPortalRootFails);
        scope.assert(assertPortalNormalizationFails);

        return scope.assert.collect();
    }),
    test('fails clearly for portal render output', function (scope) {
        scope.assert(assertPortalOutputFails);

        return scope.assert.collect();
    }),
    test('fails clearly for portal children captured in snapshots', function (scope) {
        scope.assert(assertPortalChildFails);

        return scope.assert.collect();
    }),
    test('keeps public output acyclic and free of raw React internals', function (scope) {
        scope.assert(assertPublicOutputIsIntrospectionOwned);
        scope.assert(assertCircularArrayNormalization);

        return scope.assert.collect();
    }),
    test('restores React act global state after operations', function (scope) {
        scope.assert(assertActEnvironmentRestored);
        scope.assert(assertExistingActEnvironmentRestored);

        return scope.assert.collect();
    }),
    test(
        'renders without DOM or browser globals',
        function (scope) {
            scope.assert(assertBrowserGlobalsAreNotRequired);

            return scope.assert.collect();
        }
    )
]);
