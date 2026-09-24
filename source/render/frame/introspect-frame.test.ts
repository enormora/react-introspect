import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import { createIntrospectionView as introspect } from '../../runtime/view/introspect-view.ts';
import {
    isIntrospectionRenderError,
    introspectionComponentHostType,
    throwIntrospectionRenderError
} from './introspect-frame-contract.ts';
import { createIntrospectionRenderElement } from './introspect-frame.ts';

type Counts = {
    readonly readButtonRenders: () => number;
    readonly readParentRenders: () => number;
    readonly readShellRenders: () => number;
};

type ShellProps = React.PropsWithChildren<{
    readonly title: string;
}>;

type ButtonProps = {
    readonly label: string;
};

type DepthComponents = {
    readonly Button: React.FC<ButtonProps>;
    readonly counts: Counts;
    readonly Parent: React.FC;
    readonly Shell: React.FC<ShellProps>;
};

const LabelContext = React.createContext('missing');
const lazyInitializerKey = '_init';
const lazyPayloadKey = '_payload';

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function createDepthComponents(): DepthComponents {
    let parentRenders = 0;
    let shellRenders = 0;
    let buttonRenders = 0;

    const Button: React.FC<ButtonProps> = function Button(props) {
        buttonRenders += 1;

        return React.createElement('button', null, props.label);
    };
    const Shell: React.FC<ShellProps> = function Shell(props) {
        shellRenders += 1;

        return React.createElement('section', { title: props.title }, props.children);
    };
    const Parent: React.FC = function Parent() {
        parentRenders += 1;

        return React.createElement(
            Shell,
            { title: 'Actions' },
            React.createElement(Button, { label: 'Save' })
        );
    };

    return {
        Button,
        counts: {
            readButtonRenders() {
                return buttonRenders;
            },
            readParentRenders() {
                return parentRenders;
            },
            readShellRenders() {
                return shellRenders;
            }
        },
        Parent,
        Shell
    };
}

function Counter(): React.ReactNode {
    const [ count, setCount ] = React.useState(0);

    return React.createElement(
        'button',
        {
            onClick() {
                setCount(function incrementCount(value) {
                    return value + 1;
                });
            }
        },
        String(count)
    );
}

function LabelConsumer(): React.ReactNode {
    const label = React.useContext(LabelContext);

    return React.createElement('span', null, label);
}

function ContextRoot(): React.ReactNode {
    return React.createElement(
        LabelContext,
        { value: 'provided' },
        React.createElement(LabelConsumer)
    );
}

function PlainLabel(props: ButtonProps): React.ReactNode {
    return React.createElement('span', null, props.label);
}

function createFulfilledLazyType(type: React.FC<ButtonProps>): React.FC<ButtonProps> {
    return {
        $$typeof: Symbol.for('react.lazy'),
        [lazyInitializerKey]() {
            return type;
        },
        [lazyPayloadKey]: Object.freeze({})
    } as unknown as React.FC<ButtonProps>;
}

const MemoLabel = React.memo(PlainLabel);

const ForwardLabel = React.forwardRef<unknown, ButtonProps>(function ForwardLabelComponent(props, forwardedRef) {
    return React.createElement('strong', {
        'data-has-ref': forwardedRef === null ? 'false' : 'true'
    }, props.label);
});
const MemoForwardLabel = React.memo(ForwardLabel);
const OpaqueMemo = Object.freeze({
    $$typeof: Symbol.for('react.memo'),
    compare: null,
    type: Object.freeze({ opaque: true })
});

function BigIntValue(): React.ReactNode {
    return 9_007_199_254_740_993n;
}

function GivenLeaf(props: React.PropsWithChildren): React.ReactNode {
    return React.createElement('div', null, props.children);
}

function GivenChildrenRoot(): React.ReactNode {
    return React.createElement(
        GivenLeaf,
        null,
        [
            React.createElement(React.Fragment, { key: 'fragment' }, 'fragment'),
            React.createElement(PlainLabel, { key: 'component', label: 'component' })
        ],
        new Set([
            'set'
        ]),
        { opaque: true } as never
    );
}

function Wrapper(): React.ReactNode {
    return React.createElement(
        React.Fragment,
        null,
        React.createElement(MemoLabel, { label: 'memo' }),
        React.createElement(ForwardLabel, { label: 'forward' }),
        React.createElement(MemoForwardLabel, { label: 'memo-forward' })
    );
}

function catchThrown(value: unknown): void {
    try {
        throwIntrospectionRenderError(value);
    } catch {
        Object.freeze({});
    }
}

const assertNotRendered = defineCompositeAssertion({
    assert(check, node: IntrospectionNode) {
        return check.deepEqual(node.renderedChildren, {
            reason: 'depth',
            status: 'notRendered'
        });
    },
    name: 'assertNotRendered'
});

const assertInvalidRenderElementThrows = defineCompositeAssertion({
    assert(check, invalidElement: React.ReactElement) {
        return check.throws(
            function () {
                createIntrospectionRenderElement(invalidElement, 1);
            },
            { message: 'Introspection expected React element props to be an object.' }
        );
    },
    name: 'assertInvalidRenderElementThrows'
});

export const testNode = suite('execution shallow function components', [
    test('keeps child components visible but unexecuted at depth 1', function (scope) {
        const { Button, counts, Parent, Shell } = createDepthComponents();
        const view = introspect(React.createElement(Parent), {
            strictMode: false
        });
        const shell = requireValue(view.find(Shell));

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 0);
        scope.assert.equal(counts.readButtonRenders(), 0);
        scope.assert.equal(shell.givenChildren.first?.type, Button);
        scope.assert.equal(view.find(Button), undefined);
        scope.assert(assertNotRendered, shell);

        return scope.assert.collect();
    }),
    test('executes one deeper component at depth 2', function (scope) {
        const { Button, counts, Parent, Shell } = createDepthComponents();
        const view = introspect(React.createElement(Parent), {
            depth: 2,
            strictMode: false
        });
        const button = requireValue(view.find(Button));

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 1);
        scope.assert.equal(counts.readButtonRenders(), 0);
        scope.assert.equal(requireValue(view.find(Shell)).renderedChildren.status, 'rendered');
        scope.assert.equal(button.props.label, 'Save');
        scope.assert(assertNotRendered, button);

        return scope.assert.collect();
    }),
    test('executes all function boundaries at full depth', function (scope) {
        const { counts, Parent } = createDepthComponents();
        const view = introspect(React.createElement(Parent), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 1);
        scope.assert.equal(counts.readButtonRenders(), 1);
        scope.assert.equal(view.find('button')?.textContent, 'Save');

        return scope.assert.collect();
    }),
    test('keeps hooks legal and updates through event props', function (scope) {
        const view = introspect(React.createElement(Counter), {
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        scope.assert.equal(button.isStale, true);
        scope.assert.equal(view.find('button')?.textContent, '1');

        return scope.assert.collect();
    }),
    test('transforms context providers and consumers', function (scope) {
        const view = introspect(React.createElement(ContextRoot), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(view.find('span')?.textContent, 'provided');

        return scope.assert.collect();
    }),
    test('executes memo and forwardRef components', function (scope) {
        const view = introspect(React.createElement(Wrapper), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(view.find('span')?.textContent, 'memo');
        scope.assert.equal(view.find('strong')?.textContent, 'forward');
        scope.assert.equal(view.find({ textContent: 'memo-forward', type: 'strong' })?.textContent, 'memo-forward');

        return scope.assert.collect();
    }),
    test('normalizes non-string primitive output', function (scope) {
        const view = introspect(React.createElement(BigIntValue), {
            strictMode: false
        });

        scope.assert.equal(view.textContent, '9007199254740993');

        return scope.assert.collect();
    }),
    test('normalizes rich given children on component leaves', function (scope) {
        const view = introspect(React.createElement(GivenChildrenRoot), {
            strictMode: false
        });
        const leaf = requireValue(view.find(GivenLeaf));

        scope.assert.deepEqual(
            Array.from(leaf.givenChildren, function (child) {
                return [ child.type, child.textContent ];
            }),
            [
                [ React.Fragment, 'fragment' ],
                [ PlainLabel, '' ],
                [ '#text', 'set' ],
                [ 'opaque', '' ]
            ]
        );

        return scope.assert.collect();
    }),
    test('reports invalid internal render elements', function (scope) {
        const invalidElement = {
            key: null,
            props: null,
            type: 'div'
        } as unknown as React.ReactElement;

        scope.assert(assertInvalidRenderElementThrows, invalidElement);

        return scope.assert.collect();
    }),
    test(
        'marks user host nodes that collide with Introspection internals unsupported',
        function (scope) {
            const view = introspect(React.createElement(introspectionComponentHostType), {
                depth: 'full',
                strictMode: false
            });

            const renderedChildren: unknown = view.root?.renderedChildren;

            scope.assert.deepEqual(renderedChildren, {
                reason: 'unsupported',
                status: 'notRendered'
            });

            return scope.assert.collect();
        }
    ),
    test('records unsupported memo payloads as opaque output', function (scope) {
        const view = introspect(React.createElement(OpaqueMemo as never), {
            strictMode: false
        });

        scope.assert.equal(view.find('opaque')?.state.reason, 'unsupported');

        return scope.assert.collect();
    }),
    test('transforms Suspense fallback and fulfilled lazy frames', function (scope) {
        const LazyLabel = createFulfilledLazyType(PlainLabel);
        const suspense = createIntrospectionRenderElement(
            React.createElement(
                React.Suspense,
                { fallback: React.createElement('em', null, 'loading') },
                React.createElement('span', null, 'ready')
            ),
            'full'
        );
        const suspenseProps = suspense.props as Readonly<Record<PropertyKey, unknown>>;
        const lazyView = introspect(React.createElement(LazyLabel, { label: 'lazy' }), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(suspense.type, React.Suspense);
        scope.assert.equal(React.isValidElement(suspenseProps.fallback), true);
        scope.assert.equal(lazyView.find('span')?.textContent, 'lazy');

        return scope.assert.collect();
    }),
    test('records lazy payloads that lose their initializer as empty', function (scope) {
        let reads = 0;
        const VolatileLazy = {
            $$typeof: Symbol.for('react.lazy'),
            get [lazyInitializerKey]() {
                reads += 1;

                return reads === 1
                    ? function initializeLazy() {
                        return PlainLabel;
                    }
                    : undefined;
            },
            [lazyPayloadKey]: Object.freeze({})
        } as unknown as React.FC<ButtonProps>;
        const view = introspect(React.createElement(VolatileLazy, { label: 'volatile' }), {
            depth: 'full',
            strictMode: false
        });

        const renderedChildren = view.find(VolatileLazy)?.renderedChildren;

        scope.assert.equal(renderedChildren?.status, 'rendered');

        return scope.assert.collect();
    }),
    test('unwraps synchronously fulfilled thenable output', function (scope) {
        const thenable = Object.freeze({
            then(resolve: (node: React.ReactNode) => void) {
                resolve(React.createElement('span', null, 'thenable'));
            }
        });

        function ThenableLabel(): React.ReactNode {
            return thenable as never;
        }

        const view = introspect(React.createElement(ThenableLabel), {
            depth: 'full',
            strictMode: false,
            warningMode: 'capture'
        });

        scope.assert.equal(typeof view.renderCount, 'number');

        return scope.assert.collect();
    }),
    test(
        'does not mark functions or thenables as Introspection render errors',
        function (scope) {
            const value = function value(): void {
                return undefined;
            };
            const thenable = {
                then() {
                    return undefined;
                }
            };

            catchThrown(thenable);

            scope.assert.equal(isIntrospectionRenderError(value), false);
            scope.assert.equal(isIntrospectionRenderError(thenable), false);

            return scope.assert.collect();
        }
    ),
    test('normalizes iterable output as rendered children', function (scope) {
        function IterableOutput(): Iterable<React.ReactNode> {
            return new Set([
                React.createElement('span', { key: 'one' }, 'One'),
                React.createElement('span', { key: 'two' }, 'Two')
            ]);
        }

        const view = introspect(React.createElement(IterableOutput), {
            strictMode: false,
            warningMode: 'capture'
        });

        scope.assert.equal(view.textContent, 'OneTwo');

        return scope.assert.collect();
    })
]);
