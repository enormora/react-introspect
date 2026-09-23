import { suite, test } from '@overkill-dev/test';
import React from 'react';
import { isProbeRenderError, probeComponentHostType, throwProbeRenderError } from './probe-frame-contract.ts';
import { createProbeRenderElement } from './probe-frame.ts';
import type { ProbeNode } from './probe-public-types.ts';
import { probe } from './react-probe.entry-point.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

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

function assertThrows(scope: EqualScope, action: () => void, message: string): void {
    try {
        action();
    } catch (error) {
        scope.assert.equal(error instanceof Error ? error.message : String(error), message);

        return;
    }

    throw new Error('Expected action to throw.');
}

function catchThrown(value: unknown): void {
    try {
        throwProbeRenderError(value);
    } catch {
        Object.freeze({});
    }
}

function assertNotRendered(scope: EqualScope, node: ProbeNode): void {
    scope.assert.deepEqual(node.renderedChildren, {
        reason: 'depth',
        status: 'notRendered'
    });
}

export const testNode = suite('execution shallow function components', [
    test('keeps child components visible but unexecuted at depth 1', function verifyDepthOne(scope) {
        const { Button, counts, Parent, Shell } = createDepthComponents();
        const view = probe(React.createElement(Parent), {
            strictMode: false
        });
        const shell = requireValue(view.find(Shell));

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 0);
        scope.assert.equal(counts.readButtonRenders(), 0);
        scope.assert.equal(shell.givenChildren.first?.type, Button);
        scope.assert.equal(view.find(Button), undefined);
        assertNotRendered(scope, shell);

        return scope.assert.collect();
    }),
    test('executes one deeper component at depth 2', function verifyDepthTwo(scope) {
        const { Button, counts, Parent, Shell } = createDepthComponents();
        const view = probe(React.createElement(Parent), {
            depth: 2,
            strictMode: false
        });
        const button = requireValue(view.find(Button));

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 1);
        scope.assert.equal(counts.readButtonRenders(), 0);
        scope.assert.equal(requireValue(view.find(Shell)).renderedChildren.status, 'rendered');
        scope.assert.equal(button.props.label, 'Save');
        assertNotRendered(scope, button);

        return scope.assert.collect();
    }),
    test('executes all function boundaries at full depth', function verifyFullDepth(scope) {
        const { counts, Parent } = createDepthComponents();
        const view = probe(React.createElement(Parent), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(counts.readParentRenders(), 1);
        scope.assert.equal(counts.readShellRenders(), 1);
        scope.assert.equal(counts.readButtonRenders(), 1);
        scope.assert.equal(view.find('button')?.textContent, 'Save');

        return scope.assert.collect();
    }),
    test('keeps hooks legal and updates through event props', function verifyHookUpdates(scope) {
        const view = probe(React.createElement(Counter), {
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        scope.assert.equal(button.isStale, true);
        scope.assert.equal(view.find('button')?.textContent, '1');

        return scope.assert.collect();
    }),
    test('transforms context providers and consumers', function verifyContext(scope) {
        const view = probe(React.createElement(ContextRoot), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(view.find('span')?.textContent, 'provided');

        return scope.assert.collect();
    }),
    test('executes memo and forwardRef components', function verifyReactWrappers(scope) {
        const view = probe(React.createElement(Wrapper), {
            depth: 'full',
            strictMode: false
        });

        scope.assert.equal(view.find('span')?.textContent, 'memo');
        scope.assert.equal(view.find('strong')?.textContent, 'forward');
        scope.assert.equal(view.find({ textContent: 'memo-forward', type: 'strong' })?.textContent, 'memo-forward');

        return scope.assert.collect();
    }),
    test('normalizes non-string primitive output', function verifyPrimitiveOutput(scope) {
        const view = probe(React.createElement(BigIntValue), {
            strictMode: false
        });

        scope.assert.equal(view.textContent, '9007199254740993');

        return scope.assert.collect();
    }),
    test('normalizes rich given children on component leaves', function verifyGivenChildEdges(scope) {
        const view = probe(React.createElement(GivenChildrenRoot), {
            strictMode: false
        });
        const leaf = requireValue(view.find(GivenLeaf));

        scope.assert.deepEqual(
            Array.from(leaf.givenChildren, function readChild(child) {
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
    test('reports invalid internal render elements', function verifyInvalidElement(scope) {
        const invalidElement = {
            key: null,
            props: null,
            type: 'div'
        } as unknown as React.ReactElement;

        assertThrows(
            scope,
            function renderInvalidElement() {
                createProbeRenderElement(invalidElement, 1);
            },
            'Probe expected React element props to be an object.'
        );

        return scope.assert.collect();
    }),
    test(
        'marks user host nodes that collide with Probe internals unsupported',
        function verifyInternalHostCollision(scope) {
            const view = probe(React.createElement(probeComponentHostType), {
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
    test('records unsupported memo payloads as opaque output', function verifyUnsupportedMemoPayload(scope) {
        const view = probe(React.createElement(OpaqueMemo as never), {
            strictMode: false
        });

        scope.assert.equal(view.find('opaque')?.state.reason, 'unsupported');

        return scope.assert.collect();
    }),
    test('does not mark functions or thenables as Probe render errors', function verifyRenderErrorMarker(scope) {
        const value = function value(): void {
            return undefined;
        };
        const thenable = {
            then() {
                return undefined;
            }
        };

        catchThrown(thenable);

        scope.assert.equal(isProbeRenderError(value), false);
        scope.assert.equal(isProbeRenderError(thenable), false);

        return scope.assert.collect();
    })
]);
