import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import type { IntrospectionConsoleDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { createUnitIntrospectionView as introspect } from '../../runtime/view/introspect-unit-view.test.ts';
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

type BrowserGlobalDescriptors = ReadonlyMap<string, PropertyDescriptor | undefined>;

const reactPortalType = Symbol.for('react.portal');
const noConsoleDiagnostics: IntrospectionConsoleDiagnostics = {
    subscribe() {
        return undefined;
    }
};

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
    return {
        $$typeof: reactPortalType,
        children,
        containerInfo: {},
        implementation: null,
        key: null
    } as unknown as React.ReactElement;
}

function createPortalArray(): readonly React.ReactNode[] {
    return [
        createPortalValue(React.createElement('span', null, 'portal'))
    ];
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

const sharedMetadata: LeafProps['metadata'] = {
    label: 'details',
    self: undefined
};

function ElementPropRoot(): React.ReactNode {
    return React.createElement(Leaf, {
        icon: React.createElement(Icon, { title: 'info' }),
        metadata: sharedMetadata
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

function readBrowserGlobalDescriptors(): BrowserGlobalDescriptors {
    return new Map(
        [ 'document', 'window' ].map(function readOriginalDescriptor(name) {
            return [ name, Object.getOwnPropertyDescriptor(globalThis, name) ] as const;
        })
    );
}

function installThrowingBrowserGlobals(descriptors: BrowserGlobalDescriptors): void {
    for (const name of descriptors.keys()) {
        Object.defineProperty(globalThis, name, {
            configurable: true,
            get() {
                throw new Error(`Unexpected ${name} dependency.`);
            }
        });
    }
}

function restoreBrowserGlobals(descriptors: BrowserGlobalDescriptors): void {
    for (const [ name, descriptor ] of descriptors) {
        if (descriptor === undefined) {
            Reflect.deleteProperty(globalThis, name);
        } else {
            Object.defineProperty(globalThis, name, descriptor);
        }
    }
}

export const testNode = suite('unsupported React concepts and hardening', [
    test('fails clearly for portal roots', function (scope) {
        scope.assert.throws(
            function () {
                introspect(createPortalValue(React.createElement('span', null, 'root')));
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
        scope.assert.throws(
            function () {
                normalizeSnapshotValue(
                    createPortalValue(React.createElement('span', null, 'portal')),
                    String
                );
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('fails clearly for portal render output', function (scope) {
        scope.assert.throws(
            function () {
                introspect(React.createElement(PortalOutput), {
                    depth: 'full',
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('fails clearly for portal children captured in snapshots', function (scope) {
        scope.assert.throws(
            function () {
                introspect(React.createElement(PortalArrayChildRoot), {
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('keeps public output free of raw React internals', function (scope) {
        const leaf = requireValue(introspect(React.createElement(ElementPropRoot)).find(Leaf));
        const icon = readElementProp(leaf);
        const serialized = requireValue(JSON.stringify(leaf));

        scope.assert.string(serialized);
        scope.assert.deepEqual({
            componentName: serialized.includes('"name":"Leaf"'),
            iconProps: icon.props,
            iconType: icon.type,
            internalMarker: serialized.includes('react-introspect-internal'),
            metadata: leaf.props.metadata,
            reactOwner: serialized.includes('_owner'),
            reactStore: serialized.includes('_store'),
            reactTypeMarker: serialized.includes('$$typeof'),
            reflectMarker: serialized.includes('__reactReflect')
        }, {
            componentName: true,
            iconProps: {
                title: 'info'
            },
            iconType: Icon,
            internalMarker: false,
            metadata: sharedMetadata,
            reactOwner: false,
            reactStore: false,
            reactTypeMarker: false,
            reflectMarker: false
        });

        return scope.assert.collect();
    }),
    test(
        'renders without DOM or browser globals',
        function (scope) {
            const originalDescriptors = readBrowserGlobalDescriptors();

            try {
                installThrowingBrowserGlobals(originalDescriptors);

                const view = introspect(React.createElement('main', null, 'server-safe'), {}, noConsoleDiagnostics);

                scope.assert.equal(view.textContent, 'server-safe');
            } finally {
                restoreBrowserGlobals(originalDescriptors);
            }

            return scope.assert.collect();
        }
    )
]);
