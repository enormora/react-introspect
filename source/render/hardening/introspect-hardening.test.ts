import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import { createIntrospectionView as introspect } from '../../runtime/view/introspect-view.ts';
import { normalizeSnapshotValue } from '../../snapshot/normalization/introspect-id-normalization.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
        readonly match: (actual: string, expected: RegExp) => void;
    };
};

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

function assertThrowsPortalError(scope: EqualScope, action: () => void): void {
    try {
        action();
    } catch (error) {
        scope.assert.equal(
            error instanceof Error ? error.message : String(error),
            'React Introspect cannot represent portal output yet.'
        );

        return;
    }

    throw new Error('Expected action to throw.');
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

function assertNormalizedElementProp(scope: EqualScope, leaf: IntrospectionNode): void {
    const icon = readElementProp(leaf);

    scope.assert.equal(icon.type, Icon);
    scope.assert.deepEqual(icon.props, {
        title: 'info'
    });
    scope.assert.deepEqual((leaf.props as Readonly<Record<PropertyKey, unknown>>).metadata, {
        label: 'details',
        self: '[Circular]'
    });
}

function assertPublicSerialization(scope: EqualScope, leaf: IntrospectionNode): void {
    const serialized = JSON.stringify(leaf);

    scope.assert.equal(typeof serialized, 'string');
    scope.assert.match(requireValue(serialized), /"name":"Leaf"/u);
    scope.assert.equal(requireValue(serialized).includes('__reactReflect'), false);
    scope.assert.equal(requireValue(serialized).includes('react-introspect-internal'), false);
    scope.assert.equal(requireValue(serialized).includes('$$typeof'), false);
    scope.assert.equal(requireValue(serialized).includes('_owner'), false);
    scope.assert.equal(requireValue(serialized).includes('_store'), false);
}

function assertPublicOutputIsIntrospectionOwned(scope: EqualScope): void {
    const leaf = requireValue(introspect(React.createElement(ElementPropRoot)).find(Leaf));

    assertNormalizedElementProp(scope, leaf);
    assertPublicSerialization(scope, leaf);
}

function assertPortalNormalizationFails(scope: EqualScope): void {
    assertThrowsPortalError(scope, function normalizePortalValue() {
        normalizeSnapshotValue(
            createPortalValue(React.createElement('span', null, 'portal')),
            String
        );
    });
}

function assertCircularArrayNormalization(scope: EqualScope): void {
    const value: unknown[] = [];

    value.push(value);

    scope.assert.deepEqual(normalizeSnapshotValue(value, String), [
        '[Circular]'
    ]);
}

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

function assertBrowserGlobalsAreNotRequired(scope: EqualScope): void {
    const restoreBrowserGlobals = installThrowingBrowserGlobals();

    try {
        const view = introspect(React.createElement('main', null, 'server-safe'));

        scope.assert.equal(view.textContent, 'server-safe');
    } finally {
        restoreBrowserGlobals();
    }
}

function assertActEnvironmentRestored(scope: EqualScope): void {
    const hadActEnvironment = Object.hasOwn(globalThis, actEnvironmentKey);
    const previousActEnvironment: unknown = Reflect.get(globalThis, actEnvironmentKey);

    try {
        introspect(React.createElement('main', null, 'clean'));

        scope.assert.equal(Object.hasOwn(globalThis, actEnvironmentKey), hadActEnvironment);
        scope.assert.equal(Reflect.get(globalThis, actEnvironmentKey), previousActEnvironment);
    } finally {
        if (hadActEnvironment) {
            Reflect.set(globalThis, actEnvironmentKey, previousActEnvironment);
        } else {
            Reflect.deleteProperty(globalThis, actEnvironmentKey);
        }
    }
}

function assertExistingActEnvironmentRestored(scope: EqualScope): void {
    const hadActEnvironment = Object.hasOwn(globalThis, actEnvironmentKey);
    const previousActEnvironment: unknown = Reflect.get(globalThis, actEnvironmentKey);

    try {
        Reflect.set(globalThis, actEnvironmentKey, 'existing');
        introspect(React.createElement('main', null, 'clean'));

        scope.assert.equal(Reflect.get(globalThis, actEnvironmentKey), 'existing');
    } finally {
        if (hadActEnvironment) {
            Reflect.set(globalThis, actEnvironmentKey, previousActEnvironment);
        } else {
            Reflect.deleteProperty(globalThis, actEnvironmentKey);
        }
    }
}

export const testNode = suite('unsupported React concepts and hardening', [
    test('fails clearly for portal roots', function verifyPortalRoot(scope) {
        assertThrowsPortalError(scope, function renderPortalRoot() {
            introspect(createPortalValue(React.createElement('span', null, 'root')));
        });
        assertPortalNormalizationFails(scope);

        return scope.assert.collect();
    }),
    test('fails clearly for portal render output', function verifyPortalOutput(scope) {
        assertThrowsPortalError(scope, function renderPortalOutput() {
            introspect(React.createElement(PortalOutput), {
                depth: 'full',
                strictMode: false
            });
        });

        return scope.assert.collect();
    }),
    test('fails clearly for portal children captured in snapshots', function verifyPortalChildren(scope) {
        assertThrowsPortalError(scope, function renderPortalChild() {
            introspect(React.createElement(PortalArrayChildRoot), {
                strictMode: false
            });
        });

        return scope.assert.collect();
    }),
    test('keeps public output acyclic and free of raw React internals', function verifyPublicOutput(scope) {
        assertPublicOutputIsIntrospectionOwned(scope);
        assertCircularArrayNormalization(scope);

        return scope.assert.collect();
    }),
    test('restores React act global state after operations', function verifyActEnvironment(scope) {
        assertActEnvironmentRestored(scope);
        assertExistingActEnvironmentRestored(scope);

        return scope.assert.collect();
    }),
    test(
        'renders without DOM or browser globals',
        function verifyBrowserGlobalIndependence(scope) {
            assertBrowserGlobalsAreNotRequired(scope);

            return scope.assert.collect();
        }
    )
]);
