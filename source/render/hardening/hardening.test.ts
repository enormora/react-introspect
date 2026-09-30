import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionError, IntrospectionNode } from '../../public/public-types.ts';
import type { IntrospectionConsoleDiagnostics } from '../../diagnostics/diagnostics.ts';
import { createUnitIntrospectionView as introspect } from '../../runtime/view/unit-view.test.ts';
import { createFakeRefNode, matchRefs } from '../../refs/ref.ts';
import { normalizeSnapshotValue } from '../../snapshot/normalization/id-normalization.ts';

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

type FailingLeafProps = {
    readonly message: string;
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

function PortalToggle(): React.ReactNode {
    const [ showPortal, setShowPortal ] = React.useState(false);

    if (showPortal) {
        return createPortalValue(React.createElement('span', null, 'portal'));
    }

    return React.createElement('button', {
        onClick() {
            setShowPortal(true);
        }
    }, 'open');
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

function FailingLeaf(props: FailingLeafProps): React.ReactNode {
    throw new Error(props.message);
}

const FailingClassLeaf = class extends React.Component<FailingLeafProps> {
    public override render(): React.ReactNode {
        throw new Error(this.props.message);
    }
};

type CatchAllBoundaryProps = {
    readonly children: React.ReactNode;
};

type CatchAllBoundaryState = {
    readonly failed: boolean;
};

const CatchAllBoundary = class extends React.Component<CatchAllBoundaryProps, CatchAllBoundaryState> {
    public constructor(props: CatchAllBoundaryProps) {
        super(props);

        this.state = { failed: false };
    }

    public static getDerivedStateFromError(): CatchAllBoundaryState {
        return { failed: true };
    }

    public override render(): React.ReactNode {
        return this.state.failed ? 'fallback' : this.props.children;
    }
};

type IterableChildRootProps = {
    readonly items: Iterable<React.ReactNode>;
};

function IterableChildRoot(props: IterableChildRootProps): React.ReactNode {
    return React.createElement(Icon, null, props.items);
}

function* createLabels(): Generator<React.ReactNode> {
    yield React.createElement('span', null, 'first');
    yield React.createElement('span', null, 'second');
}

function LabelledInput(): React.ReactNode {
    const id = React.useId();

    return React.createElement('input', { id });
}

function* createPortalLabels(): Generator<React.ReactNode> {
    yield createPortalValue(React.createElement('span', null, 'portal'));
}

function describeFailure(action: () => void): string {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }

    return 'returned';
}

function readTextContent(node: IntrospectionNode): string {
    return node.textContent;
}

function readErrorMessage(error: IntrospectionError): string {
    return error.message;
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
    test('fails clearly for portal render output under an error boundary', function (scope) {
        scope.assert.throws(
            function () {
                introspect(React.createElement(CatchAllBoundary, null, React.createElement(PortalOutput)), {
                    depth: 'full',
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('fails clearly for portal output that appears under an error boundary after an event', function (scope) {
        const view = introspect(React.createElement(CatchAllBoundary, null, React.createElement(PortalToggle)), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.throws(
            function () {
                view.locate('button').sendEvent('click');
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );
        scope.assert.equal(view.caughtErrors.length, 0);

        return scope.assert.collect();
    }),
    test('reports portal output under a boundary before ref shorthands its fallback cannot satisfy', function (scope) {
        scope.assert.throws(
            function () {
                introspect(
                    React.createElement(
                        CatchAllBoundary,
                        null,
                        React.createElement('input', { ref: React.createRef() }),
                        React.createElement(PortalOutput)
                    ),
                    {
                        depth: 'full',
                        refs: { input: createFakeRefNode({ tag: 'input' }) },
                        strictMode: false
                    }
                );
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('fails clearly for an ambiguous ref rule under an error boundary', function (scope) {
        const inputNode = createFakeRefNode({ tag: 'input' });

        scope.assert.throws(
            function () {
                introspect(
                    React.createElement(
                        CatchAllBoundary,
                        null,
                        React.createElement('input', { name: 'email', ref: React.createRef() })
                    ),
                    {
                        depth: 'full',
                        refs: matchRefs([
                            { node: inputNode, type: 'input' },
                            { node: inputNode, props: { name: 'email' } }
                        ]),
                        strictMode: false
                    }
                );
            },
            { message: 'Ref target input matches multiple ref rules.' }
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
    test('keeps given children that come from a generator', function (scope) {
        const view = introspect(React.createElement(IterableChildRoot, { items: createLabels() }), {
            strictMode: false
        });
        const icon = requireValue(view.find(Icon));

        scope.assert.deepEqual(Array.from(icon.givenChildren, readTextContent), [ 'first', 'second' ]);

        return scope.assert.collect();
    }),
    test('fails clearly for portal children inside a Set of given children', function (scope) {
        scope.assert.throws(
            function () {
                introspect(
                    React.createElement(IterableChildRoot, {
                        items: new Set([ createPortalValue(React.createElement('span', null, 'portal')) ])
                    }),
                    { strictMode: false }
                );
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('fails clearly for portal children from a generator of given children', function (scope) {
        scope.assert.throws(
            function () {
                introspect(React.createElement(IterableChildRoot, { items: createPortalLabels() }), {
                    strictMode: false
                });
            },
            { message: 'React Introspect cannot represent portal output yet.' }
        );

        return scope.assert.collect();
    }),
    test('keeps later views working after portal children fail inside the commit', function (scope) {
        const failure = describeFailure(function introspectPortalSet() {
            introspect(
                React.createElement(IterableChildRoot, {
                    items: new Set([ createPortalValue(React.createElement('span', null, 'portal')) ])
                }),
                { strictMode: false }
            );
        });
        const laterView = introspect(React.createElement('main', null, 'after'), { strictMode: false });

        scope.assert.deepEqual(
            { failure, laterText: laterView.textContent },
            { failure: 'React Introspect cannot represent portal output yet.', laterText: 'after' }
        );

        return scope.assert.collect();
    }),
    test('records a failing idGenerator as an uncaught error and keeps later views working', function (scope) {
        const view = introspect(React.createElement(LabelledInput), {
            errorMode: 'capture',
            idGenerator() {
                throw new Error('generator failed');
            },
            strictMode: false
        });
        const laterView = introspect(React.createElement('main', null, 'after'), { strictMode: false });

        scope.assert.deepEqual(
            { laterText: laterView.textContent, uncaught: view.uncaughtErrors.map(readErrorMessage) },
            { laterText: 'after', uncaught: [ 'generator failed' ] }
        );

        return scope.assert.collect();
    }),
    test(
        'unmounts the view like an uncaught render error when an update fails building the snapshot',
        function (scope) {
            const view = introspect(React.createElement('main', null, 'first'), {
                errorMode: 'capture',
                idGenerator() {
                    throw new Error('generator failed');
                },
                strictMode: false
            });

            view.update(React.createElement(LabelledInput));

            scope.assert.deepEqual(
                { root: view.root, uncaught: view.uncaughtErrors.map(readErrorMessage) },
                { root: undefined, uncaught: [ 'generator failed' ] }
            );

            return scope.assert.collect();
        }
    ),
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
    test('runs function and class components before checking their given children for portals', function (scope) {
        const leafProps: FailingLeafProps = { message: 'Leaf failed.' };
        const functionView = introspect(React.createElement(FailingLeaf, leafProps, createPortalArray()), {
            errorMode: 'capture',
            strictMode: false
        });
        const classView = introspect(React.createElement(FailingClassLeaf, leafProps, createPortalArray()), {
            errorMode: 'capture',
            strictMode: false
        });

        scope.assert.deepEqual(
            [ functionView.uncaughtErrors.map(readErrorMessage), classView.uncaughtErrors.map(readErrorMessage) ],
            [ [ 'Leaf failed.' ], [ 'Leaf failed.' ] ]
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
