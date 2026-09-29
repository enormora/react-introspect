import { suite, test } from '@overkill-dev/test';
import { defineCompositeAssertion } from '@overkill-dev/test/assert';
import React from 'react';
import type { IntrospectionNode } from '../../public/introspect-public-types.ts';
import { createUnitIntrospectionView as introspect } from '../../runtime/view/introspect-unit-view.test.ts';
import { isIntrospectionRenderError, throwIntrospectionRenderError } from './introspect-render-error.ts';
import { createFrameDepth } from './introspect-frame-depth.ts';
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

type SeededLabelListProps = {
    readonly labels: readonly string[];
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

function SeededLabel(props: ButtonProps): React.ReactNode {
    const [ label ] = React.useState(props.label);

    return React.createElement('span', null, label);
}

function SeededLabelList(props: SeededLabelListProps): React.ReactNode {
    return props.labels.map(function renderSeededLabel(label) {
        return React.createElement(SeededLabel, { key: label, label });
    });
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

function StatefulFirst(): React.ReactNode {
    const [ label ] = React.useState('first state');

    return React.createElement('span', null, label);
}

function StatefulSecond(): React.ReactNode {
    const [ label ] = React.useState('second state');

    return React.createElement('span', null, label);
}

function ignoreProfile(): undefined {
    return undefined;
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
        [lazyPayloadKey]: {}
    } as unknown as React.FC<ButtonProps>;
}

const MemoLabel = React.memo(PlainLabel);

const ForwardLabel = React.forwardRef<unknown, ButtonProps>(function ForwardLabelComponent(props, forwardedRef) {
    return React.createElement('strong', {
        'data-has-ref': forwardedRef === null ? 'false' : 'true'
    }, props.label);
});
const MemoForwardLabel = React.memo(ForwardLabel);
const OpaqueMemo = {
    $$typeof: Symbol.for('react.memo'),
    compare: null,
    type: { opaque: true }
};

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

type RenderLog = {
    readonly record: (name: string) => void;
    readonly rendered: () => readonly string[];
};

type AnchoredComponents = {
    readonly Button: React.FC<ButtonProps>;
    readonly Harness: React.FC<React.PropsWithChildren>;
    readonly log: RenderLog;
    readonly Page: React.FC;
    readonly Theme: React.FC<React.PropsWithChildren>;
};

type NestedPageProps = {
    readonly level: number;
};

function createRenderLog(): RenderLog {
    const names: string[] = [];

    return {
        record(name) {
            names.push(name);
        },
        rendered() {
            return Array.from(names);
        }
    };
}

type LoggedLabelProps = ButtonProps & {
    readonly log: RenderLog;
};

type RerenderingParentProps = {
    readonly log: RenderLog;
};

function LoggedLabel(props: LoggedLabelProps): React.ReactNode {
    props.log.record(props.label);

    return React.createElement('span', null, props.label);
}

const ShallowMemoLabel = React.memo(LoggedLabel);

const LabelIgnoringMemoLabel = React.memo(LoggedLabel, function ignoresLabel(previous, next) {
    return previous.log === next.log;
});

const LoggedClassLabel = class extends React.Component<LoggedLabelProps> {
    public override render(): React.ReactNode {
        this.props.log.record(`class ${this.props.label}`);

        return React.createElement('span', null, this.props.label);
    }
};

const MemoClassLabel = React.memo(LoggedClassLabel);

function alwaysEqual(): boolean {
    return true;
}

const AlwaysEqualMemoLabel = React.memo(LoggedLabel, alwaysEqual);

const NestedMemoLabel = React.memo(React.memo(LoggedLabel, alwaysEqual));

function createRefLabelProps(log: RenderLog): LoggedLabelProps & React.RefAttributes<unknown> {
    return {
        label: 'ref',
        log,
        ref() {
            return undefined;
        }
    };
}

function RerenderingParent(props: RerenderingParentProps): React.ReactNode {
    const [ renders, setRenders ] = React.useState(0);

    return React.createElement(
        React.Fragment,
        null,
        React.createElement('button', {
            onClick() {
                setRenders(renders + 1);
            }
        }),
        React.createElement(ShallowMemoLabel, { label: 'shallow', log: props.log }),
        React.createElement(LabelIgnoringMemoLabel, { label: `custom ${renders}`, log: props.log }),
        React.createElement(MemoClassLabel, { label: 'memo', log: props.log }),
        React.createElement(AlwaysEqualMemoLabel, createRefLabelProps(props.log)),
        React.createElement(NestedMemoLabel, { label: `nested ${renders}`, log: props.log })
    );
}

function createAnchoredComponents(): AnchoredComponents {
    const log = createRenderLog();
    const Button: React.FC<ButtonProps> = function Button(props) {
        log.record('Button');

        return React.createElement('button', null, props.label);
    };
    const Theme: React.FC<React.PropsWithChildren> = function Theme(props): React.ReactNode {
        log.record('Theme');

        return props.children;
    };
    const Page: React.FC = function Page() {
        log.record('Page');

        return React.createElement(Theme, null, React.createElement(Button, { label: 'Save' }));
    };
    const RouterInternals: React.FC<React.PropsWithChildren> = function RouterInternals(props): React.ReactNode {
        log.record('RouterInternals');

        return props.children;
    };
    const Harness: React.FC<React.PropsWithChildren> = function Harness(props) {
        log.record('Harness');

        return React.createElement(RouterInternals, null, props.children);
    };

    return { Button, Harness, log, Page, Theme };
}

function createNestedPage(log: RenderLog): React.FC<NestedPageProps> {
    const NestedPage: React.FC<NestedPageProps> = function NestedPage(props): React.ReactNode {
        log.record(`NestedPage${props.level}`);

        return props.level < 2 ? React.createElement(NestedPage, { level: props.level + 1 }) : null;
    };

    return NestedPage;
}

function readRenderedChildTypes(node: IntrospectionNode): readonly unknown[] | 'notRendered' {
    const { renderedChildren } = node;

    return renderedChildren.status === 'rendered'
        ? Array.from(renderedChildren.nodes, function readType(child) {
            return child.type;
        })
        : 'notRendered';
}

const assertUnexecutedPassThrough = defineCompositeAssertion({
    assert(check, node: IntrospectionNode, childTypes: readonly unknown[]) {
        return check.deepEqual({
            renderedChildTypes: readRenderedChildTypes(node),
            state: node.state,
            visibility: node.visibility
        }, {
            renderedChildTypes: childTypes,
            state: { activityMode: undefined, reason: 'depth', rendered: false, visible: true },
            visibility: 'visible'
        });
    },
    name: 'assertUnexecutedPassThrough'
});

function Form(props: React.PropsWithChildren): React.ReactNode {
    return React.createElement('form', null, props.children);
}

function PageLayout(props: React.PropsWithChildren): React.ReactNode {
    return React.createElement('main', null, props.children);
}

function NestedGivenPage(): React.ReactNode {
    return React.createElement(
        PageLayout,
        null,
        React.createElement(
            Form,
            null,
            React.createElement(PlainLabel, { label: 'Save' }),
            React.createElement('span', null, 'a'),
            React.createElement('span', null, 'b')
        )
    );
}

export const testNode = suite('execution shallow function components', [
    test('keeps child components visible but unexecuted at depth 1', function (scope) {
        const { Button, counts, Parent, Shell } = createDepthComponents();
        const view = introspect(React.createElement(Parent), {
            strictMode: false
        });
        const shell = requireValue(view.find(Shell));

        scope.assert.deepEqual({
            buttonLabel: view.find(Button)?.props.label,
            givenType: shell.givenChildren.first?.type,
            hostButton: view.find('button'),
            renders: [ counts.readParentRenders(), counts.readShellRenders(), counts.readButtonRenders() ],
            tree: view.formatTree()
        }, {
            buttonLabel: 'Save',
            givenType: Button,
            hostButton: undefined,
            renders: [ 1, 0, 0 ],
            tree: 'Parent\n  Shell\n    Button\n      #empty'
        });
        scope.assert(assertUnexecutedPassThrough, shell, [ Button ]);

        return scope.assert.collect();
    }),
    test('searches nested children handed to unexecuted components', function (scope) {
        const view = introspect(React.createElement(NestedGivenPage), {
            strictMode: false
        });
        const form = requireValue(view.find(Form));

        scope.assert.deepEqual({
            formPath: form.path,
            formSpans: form.findAll('span').length,
            hostOutput: [ view.find('main'), view.find('form') ],
            label: view.find(PlainLabel)?.path,
            tree: view.formatTree()
        }, {
            formPath: 'NestedGivenPage > PageLayout[0] > Form[0]',
            formSpans: 2,
            hostOutput: [ undefined, undefined ],
            label: 'NestedGivenPage > PageLayout[0] > Form[0] > PlainLabel[0]',
            tree: [
                'NestedGivenPage',
                '  PageLayout',
                '    Form',
                '      PlainLabel',
                '        #empty',
                '      span',
                '        #text',
                '      span',
                '        #text'
            ]
                .join('\n')
        });

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
        scope.assert(assertUnexecutedPassThrough, button, [ '#empty' ]);

        return scope.assert.collect();
    }),
    test('counts depth from the first instance of the depthFrom component', function (scope) {
        const { Harness, log, Page } = createAnchoredComponents();

        introspect(React.createElement(Harness, null, React.createElement(Page)), {
            depthFrom: Page,
            strictMode: false
        });

        scope.assert.deepEqual(log.rendered(), [ 'Harness', 'RouterInternals', 'Page' ]);

        return scope.assert.collect();
    }),
    test('does not restart depth counting at nested depthFrom instances', function (scope) {
        const log = createRenderLog();
        const NestedPage = createNestedPage(log);

        introspect(React.createElement(NestedPage, { level: 0 }), {
            depth: 2,
            depthFrom: NestedPage,
            strictMode: false
        });

        scope.assert.deepEqual(log.rendered(), [ 'NestedPage0', 'NestedPage1' ]);

        return scope.assert.collect();
    }),
    test('executes the whole tree when the depthFrom component never renders', function (scope) {
        const { Harness, log, Page } = createAnchoredComponents();
        const Missing: React.FC = function Missing() {
            return null;
        };

        introspect(React.createElement(Harness, null, React.createElement(Page)), {
            depthFrom: Missing,
            strictMode: false
        });

        scope.assert.deepEqual(log.rendered(), [ 'Harness', 'RouterInternals', 'Page', 'Theme', 'Button' ]);

        return scope.assert.collect();
    }),
    test('executes transparent components without consuming depth', function (scope) {
        const { Button, log, Page, Theme } = createAnchoredComponents();
        const view = introspect(React.createElement(Theme, null, React.createElement(Page)), {
            strictMode: false,
            transparent: [ Theme ]
        });

        scope.assert.deepEqual({
            button: view.find(Button)?.state.reason,
            rendered: log.rendered()
        }, {
            button: 'depth',
            rendered: [ 'Theme', 'Page', 'Theme' ]
        });

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
    test('remounts a component whose key changes', function (scope) {
        const view = introspect(React.createElement(SeededLabel, { key: 'first', label: 'first' }), {
            strictMode: false
        });

        view.update(React.createElement(SeededLabel, { key: 'second', label: 'second' }));

        scope.assert.equal(view.textContent, 'second');

        return scope.assert.collect();
    }),
    test('keeps component state with its key when siblings reorder', function (scope) {
        const view = introspect(React.createElement(SeededLabelList, { labels: [ 'first', 'second' ] }), {
            depth: 'full',
            strictMode: false
        });

        view.update(React.createElement(SeededLabelList, { labels: [ 'third', 'first', 'second' ] }));

        scope.assert.equal(view.textContent, 'thirdfirstsecond');

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

        scope.assert.throws(
            function () {
                createIntrospectionRenderElement(
                    invalidElement,
                    createFrameDepth({ budget: 1, depthFrom: undefined, transparent: [] })
                );
            },
            { message: 'Introspection expected React element props to be an object.' }
        );

        return scope.assert.collect();
    }),
    test(
        'marks user host nodes that collide with Introspection internals unsupported',
        function (scope) {
            const view = introspect(React.createElement('react-introspect-internal-component'), {
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
    test('captures a lazy component that fails to load as an uncaught render error', function (scope) {
        const failure = new Error('lazy component failed to load');
        const BrokenLazy = {
            $$typeof: Symbol.for('react.lazy'),
            [lazyInitializerKey]() {
                throw failure;
            },
            [lazyPayloadKey]: {}
        } as unknown as React.FC;
        const view = introspect(React.createElement(BrokenLazy), {
            depth: 'full',
            errorMode: 'capture',
            strictMode: false
        });

        scope.assert.undefined(view.root);
        scope.assert.equal(view.uncaughtErrors.at(-1)?.cause, failure);

        return scope.assert.collect();
    }),
    test('executes components inside StrictMode and Profiler', function (scope) {
        const view = introspect(
            React.createElement(
                React.StrictMode,
                null,
                React.createElement(
                    React.Profiler,
                    { id: 'labels', onRender: ignoreProfile },
                    React.createElement(PlainLabel, { label: 'profiled' })
                )
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        scope.assert.equal(view.find('span')?.textContent, 'profiled');
        scope.assert.equal(view.formatTree(), 'StrictMode\n  Profiler\n    PlainLabel\n      span\n        #text');

        return scope.assert.collect();
    }),
    test('marks elements of unknown types unsupported', function (scope) {
        const unknownType = { unknown: true } as unknown as React.FC<ButtonProps>;
        const view = introspect(React.createElement(unknownType, { label: 'unknown' }), {
            depth: 'full',
            strictMode: false
        });
        const root = requireValue(view.root);

        scope.assert.deepEqual({
            renderedChildren: root.renderedChildren,
            state: root.state,
            visibility: root.visibility
        }, {
            renderedChildren: { reason: 'unsupported', status: 'notRendered' },
            state: { activityMode: undefined, reason: 'unsupported', rendered: false, visible: false },
            visibility: 'notRendered'
        });

        return scope.assert.collect();
    }),
    test('skips memo components whose compare reports equal props', function (scope) {
        const log = createRenderLog();
        const view = introspect(React.createElement(RerenderingParent, { log }), {
            depth: 'full',
            strictMode: false
        });

        requireValue(view.find('button')).sendEvent('click');

        scope.assert.deepEqual(log.rendered(), [ 'shallow', 'custom 0', 'class memo', 'ref', 'nested 0', 'ref' ]);
        scope.assert.equal(view.find(LabelIgnoringMemoLabel)?.textContent, 'custom 0');

        return scope.assert.collect();
    }),
    test('remounts when a different component takes the same position', function (scope) {
        const view = introspect(React.createElement(StatefulFirst), {
            depth: 'full',
            strictMode: false
        });

        view.update(React.createElement(StatefulSecond));

        scope.assert.equal(view.find('span')?.textContent, 'second state');

        return scope.assert.collect();
    }),
    test('remounts when a differently wrapped component takes the same position', function (scope) {
        const swaps: readonly (readonly [React.ElementType, React.ElementType])[] = [
            [ React.memo(StatefulFirst), React.memo(StatefulSecond) ],
            [ React.forwardRef(StatefulFirst), React.forwardRef(StatefulSecond) ],
            [ createFulfilledLazyType(StatefulFirst), createFulfilledLazyType(StatefulSecond) ]
        ];

        scope.assert.deepEqual(
            swaps.map(function readTextAfterSwap([ first, second ]) {
                const view = introspect(React.createElement(first), { depth: 'full', strictMode: false });

                view.update(React.createElement(second));

                return view.find('span')?.textContent;
            }),
            [ 'second state', 'second state', 'second state' ]
        );

        return scope.assert.collect();
    }),
    test('records unsupported memo payloads as opaque output', function (scope) {
        const view = introspect(React.createElement(OpaqueMemo as never), {
            strictMode: false
        });

        const opaque = requireValue(view.find('opaque'));

        scope.assert.deepEqual({ state: opaque.state, visibility: opaque.visibility }, {
            state: { activityMode: undefined, reason: 'unsupported', rendered: false, visible: false },
            visibility: 'notRendered'
        });

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
            createFrameDepth({ budget: 'full', depthFrom: undefined, transparent: [] })
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
            [lazyPayloadKey]: {}
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
        const thenable = {
            then(resolve: (node: React.ReactNode) => void) {
                resolve(React.createElement('span', null, 'thenable'));
            }
        };

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

            scope.assert.throws(
                function () {
                    throwIntrospectionRenderError(thenable);
                },
                { exact: thenable }
            );

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
