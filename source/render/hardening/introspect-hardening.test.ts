import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import type { IntrospectionConsoleDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import type { IntrospectionRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies-types.ts';
import { createUnitRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies.test.ts';
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

type ActObservation = {
    readonly actCalls: number;
    readonly active: boolean;
    readonly componentObservedAct: boolean;
    readonly restored: boolean;
};

type ObservedActRuntime = {
    readonly component: () => React.ReactNode;
    readonly readObservation: () => ActObservation;
    readonly runtime: IntrospectionRuntimeDependencies;
};

type FailingActRuntime = {
    readonly readObservation: () => Pick<ActObservation, 'active' | 'restored'>;
    readonly runtime: IntrospectionRuntimeDependencies;
};

const reactPortalType = Symbol.for('react.portal');
const noConsoleDiagnostics: IntrospectionConsoleDiagnostics = Object.freeze({
    subscribe() {
        return undefined;
    }
});

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

function createObservedActRuntime(): ObservedActRuntime {
    const unitRuntime = createUnitRuntimeDependencies();
    let actCalls = 0;
    let active = false;
    let componentObservedAct = false;
    let restored = false;

    function ActProbe(): React.ReactNode {
        componentObservedAct = active;

        return React.createElement('main', null, 'clean');
    }

    const runtime: IntrospectionRuntimeDependencies = {
        ...unitRuntime,
        actEnvironment: Object.freeze({
            act(action: () => unknown) {
                actCalls += 1;
                active = true;

                try {
                    return unitRuntime.actEnvironment.act(action);
                } finally {
                    active = false;
                    restored = true;
                }
            }
        })
    };

    return Object.freeze({
        component: ActProbe,
        readObservation() {
            return {
                actCalls,
                active,
                componentObservedAct,
                restored
            };
        },
        runtime
    });
}

function createFailingActRuntime(): FailingActRuntime {
    const unitRuntime = createUnitRuntimeDependencies();
    let active = false;
    let restored = false;
    const runtime: IntrospectionRuntimeDependencies = {
        ...unitRuntime,
        actEnvironment: Object.freeze({
            act(action: () => unknown) {
                active = true;

                try {
                    unitRuntime.actEnvironment.act(action);

                    throw new Error('Injected act failed.');
                } finally {
                    active = false;
                    restored = true;
                }
            }
        })
    };

    return Object.freeze({
        readObservation() {
            return {
                active,
                restored
            };
        },
        runtime
    });
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
    test('uses injected React act environment', function (scope) {
        const observed = createObservedActRuntime();
        const view = introspect(React.createElement(observed.component), {}, noConsoleDiagnostics, observed.runtime);

        scope.assert.deepEqual(observed.readObservation(), {
            actCalls: 1,
            active: false,
            componentObservedAct: true,
            restored: true
        });
        scope.assert.equal(view.textContent, 'clean');

        return scope.assert.collect();
    }),
    test('restores injected React act environment after failure', function (scope) {
        const failingAct = createFailingActRuntime();

        scope.assert.throws(
            function () {
                introspect(React.createElement('main'), {}, noConsoleDiagnostics, failingAct.runtime);
            },
            { message: 'Injected act failed.' }
        );
        scope.assert.deepEqual(failingAct.readObservation(), {
            active: false,
            restored: true
        });

        return scope.assert.collect();
    }),
    test(
        'renders without DOM or browser globals',
        function (scope) {
            const runtime: IntrospectionRuntimeDependencies = {
                ...createUnitRuntimeDependencies(),
                browserEnvironment: Object.freeze({
                    readDocument() {
                        throw new Error('Unexpected document dependency.');
                    },
                    readWindow() {
                        throw new Error('Unexpected window dependency.');
                    }
                })
            };
            const view = introspect(
                React.createElement('main', null, 'server-safe'),
                {},
                noConsoleDiagnostics,
                runtime
            );

            scope.assert.equal(view.textContent, 'server-safe');

            return scope.assert.collect();
        }
    )
]);
