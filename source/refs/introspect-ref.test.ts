import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionFakeRefNode } from '../public/introspect-public-types.ts';
import { createIntrospectionView as introspect } from '../runtime/view/introspect-view.ts';
import { createFakeRefNode, matchRefs } from './introspect-ref.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

type FocusNode = {
    readonly focus: () => void;
};

type ForwardedInputProps = {
    readonly name: string;
};

type ParentWithLeafRefProps = {
    readonly leafRef: React.Ref<unknown>;
};

type LeafProps = {
    readonly marker: 'leaf';
};

function assertThrows(scope: EqualScope, action: () => void, message: string): void {
    try {
        action();
    } catch (error) {
        scope.assert.equal(error instanceof Error ? error.message : String(error), message);

        return;
    }

    throw new Error('Expected action to throw.');
}

function createFocusNode(recordFocus: () => void): IntrospectionFakeRefNode<FocusNode> {
    return createFakeRefNode({
        focus() {
            recordFocus();
        }
    });
}

function AutoFocusInput(): React.ReactNode {
    const inputRef = React.useRef<FocusNode | null>(null);

    React.useLayoutEffect(function focusInput() {
        inputRef.current?.focus();
    }, []);

    return React.createElement('input', {
        ref: inputRef
    });
}

function SignupForm(): React.ReactNode {
    const emailRef = React.useRef<FocusNode | null>(null);
    const passwordRef = React.useRef<FocusNode | null>(null);
    const submitRef = React.useRef<FocusNode | null>(null);

    React.useLayoutEffect(function focusFields() {
        emailRef.current?.focus();
        passwordRef.current?.focus();
        submitRef.current?.focus();
    }, []);

    return React.createElement(
        'form',
        null,
        React.createElement('input', { name: 'email', ref: emailRef, tags: [ 'email', 'field' ] }),
        React.createElement('input', { name: 'password', ref: passwordRef, tags: [ 'password', 'field' ] }),
        React.createElement('button', { key: 'submit', ref: submitRef, type: 'submit' }, 'Save')
    );
}

function TwoInputs(): React.ReactNode {
    const firstRef = React.useRef<FocusNode | null>(null);
    const secondRef = React.useRef<FocusNode | null>(null);

    return React.createElement(
        React.Fragment,
        null,
        React.createElement('input', { ref: firstRef }),
        React.createElement('input', { ref: secondRef })
    );
}

const ForwardedInput = React.forwardRef<FocusNode, ForwardedInputProps>(function ForwardedInputComponent(
    props,
    ref
) {
    return React.createElement('input', {
        name: props.name,
        ref
    });
});

const Leaf = React.forwardRef<unknown, LeafProps>(function LeafComponent() {
    throw new Error('Leaf should not execute.');
});

function ParentWithLeafRef(props: ParentWithLeafRefProps): React.ReactNode {
    return React.createElement(Leaf, {
        marker: 'leaf',
        ref: props.leafRef
    });
}

function assertShorthandRef(scope: EqualScope): void {
    let focusCount = 0;
    const inputNode = createFocusNode(function recordFocus() {
        focusCount += 1;
    });

    introspect(React.createElement(AutoFocusInput), {
        depth: 'full',
        refs: {
            input: inputNode
        },
        strictMode: false
    });

    scope.assert.equal(focusCount, 1);
}

function assertCallbackRef(scope: EqualScope): void {
    const inputNode = createFakeRefNode({ tag: 'input' });
    let receivedNode: unknown = null;

    introspect(
        React.createElement('input', {
            ref(node: unknown) {
                receivedNode = node;
            }
        }),
        {
            refs: {
                input: inputNode
            },
            strictMode: false
        }
    );

    scope.assert.equal(receivedNode, inputNode);
}

function assertMatchedRefs(scope: EqualScope): void {
    const focused: string[] = [];
    const emailNode = createFocusNode(function focusEmail() {
        focused.push('email');
    });
    const passwordNode = createFocusNode(function focusPassword() {
        focused.push('password');
    });
    const submitNode = createFocusNode(function focusSubmit() {
        focused.push('submit');
    });

    introspect(React.createElement(SignupForm), {
        depth: 'full',
        refs: matchRefs([
            {
                node: emailNode,
                props: { tags: [ 'email' ] },
                type: 'input',
                where(target) {
                    return target.name === 'input';
                }
            },
            {
                node: passwordNode,
                props: { name: 'password' },
                type: 'input'
            },
            {
                key: 'submit',
                node: submitNode,
                props: { type: 'submit' },
                type: 'button'
            }
        ]),
        strictMode: false
    });

    scope.assert.deepEqual(focused, [ 'email', 'password', 'submit' ]);
}

function assertFactoryRefs(scope: EqualScope): void {
    const names: string[] = [];

    introspect(React.createElement(SignupForm), {
        depth: 'full',
        refs: matchRefs([
            {
                node(target) {
                    const targetProps = target.props as Readonly<Record<PropertyKey, unknown>>;

                    return createFocusNode(function focusTarget() {
                        names.push(String(targetProps.name ?? targetProps.type));
                    });
                },
                type: 'input'
            },
            {
                node: createFocusNode(function focusSubmit() {
                    names.push('submit');
                }),
                type: 'button'
            }
        ]),
        strictMode: false
    });

    scope.assert.deepEqual(names, [ 'email', 'password', 'submit' ]);
}

function assertForwardRef(scope: EqualScope): void {
    const inputNode = createFocusNode(function noop() {
        return undefined;
    });
    const objectRef = React.createRef<FocusNode | null>();

    introspect(
        React.createElement(ForwardedInput, {
            name: 'forwarded',
            ref: objectRef
        }),
        {
            depth: 'full',
            refs: {
                input: inputNode
            },
            strictMode: false
        }
    );

    scope.assert.equal(objectRef.current, inputNode);
}

function assertLeafRefIsNotInvoked(scope: EqualScope): void {
    const calls: unknown[] = [];

    introspect(
        React.createElement(ParentWithLeafRef, {
            leafRef(node) {
                calls.push(node);
            }
        }),
        {
            strictMode: false
        }
    );

    scope.assert.deepEqual(calls, []);
}

function assertAmbiguityErrors(scope: EqualScope): void {
    const inputNode = createFocusNode(function noop() {
        return undefined;
    });

    assertThrows(scope, function renderMissingShorthand() {
        introspect(
            React.createElement('button', {
                ref: React.createRef()
            }),
            {
                refs: {
                    input: inputNode
                },
                strictMode: false
            }
        );
    }, 'Ref shorthand input matched no host refs.');

    assertThrows(scope, function renderMultipleShorthand() {
        introspect(React.createElement(TwoInputs), {
            depth: 'full',
            refs: {
                input: inputNode
            },
            strictMode: false
        });
    }, 'Ref shorthand input matched multiple host refs.');

    assertThrows(scope, function renderMultipleRuleMatches() {
        introspect(
            React.createElement('input', {
                name: 'email',
                ref: React.createRef()
            }),
            {
                refs: matchRefs([
                    {
                        node: inputNode,
                        type: 'input'
                    },
                    {
                        node: inputNode,
                        props: { name: 'email' }
                    }
                ]),
                strictMode: false
            }
        );
    }, 'Ref target input matches multiple ref rules.');
}

export const testNode = suite('refs', [
    test('injects shorthand fake refs into host object refs', function verifyShorthandRef(scope) {
        assertShorthandRef(scope);

        return scope.assert.collect();
    }),
    test('passes fake host nodes to callback refs', function verifyCallbackRef(scope) {
        assertCallbackRef(scope);

        return scope.assert.collect();
    }),
    test('matches selector rules for host refs', function verifyMatchedRefs(scope) {
        assertMatchedRefs(scope);

        return scope.assert.collect();
    }),
    test('creates factory fake nodes per matched target', function verifyFactoryRefs(scope) {
        assertFactoryRefs(scope);

        return scope.assert.collect();
    }),
    test('passes an executed forwardRef ref through to its host output', function verifyForwardRef(scope) {
        assertForwardRef(scope);

        return scope.assert.collect();
    }),
    test('does not invoke refs on non-rendered component leaves', function verifyLeafRef(scope) {
        assertLeafRefIsNotInvoked(scope);

        return scope.assert.collect();
    }),
    test('reports ambiguous or missing ref rules', function verifyRefErrors(scope) {
        assertAmbiguityErrors(scope);

        return scope.assert.collect();
    })
]);
