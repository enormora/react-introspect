import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { IntrospectionError, IntrospectionView } from '../../public/introspect-public-types.ts';
import { createUnitIntrospectionView as introspect } from '../../runtime/view/introspect-unit-view.test.ts';

type Recorder = {
    readonly entries: readonly string[];
    readonly push: (entry: string) => void;
};

type LifecycleProps = {
    readonly label: string;
    readonly recorder: Recorder;
};

type LifecycleState = {
    readonly suffix: string;
};

type CounterState = {
    readonly count: number;
};

type EmptyProps = Readonly<Record<PropertyKey, never>>;

type BoundaryProps = React.PropsWithChildren<{
    readonly recorder: Recorder;
}>;

type BoundaryState = {
    readonly failed: boolean;
};

function createPassingBoundaryState(): BoundaryState {
    return { failed: false };
}

function createBoundaryState(failed: boolean): BoundaryState {
    return { failed };
}

function readErrorMessage(error: IntrospectionError): string {
    return error.message;
}

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function createRecorder(): Recorder {
    const entries: string[] = [];

    return {
        get entries() {
            return entries.slice();
        },
        push(entry: string) {
            entries.push(entry);
        }
    };
}

const LifecyclePanel = class extends React.Component<LifecycleProps, LifecycleState> {
    public constructor(props: LifecycleProps) {
        super(props);

        this.state = { suffix: 'created' };
    }

    public static getDerivedStateFromProps(
        props: LifecycleProps,
        state: LifecycleState
    ): Partial<LifecycleState> | null {
        if (props.label === 'derived' && state.suffix !== 'derived') {
            return { suffix: 'derived' };
        }

        return null;
    }

    public override render(): React.ReactNode {
        this.props.recorder.push(`render:${this.props.label}:${this.state.suffix}`);

        return React.createElement('output', null, `${this.props.label}:${this.state.suffix}`);
    }

    public override componentDidMount(): void {
        this.props.recorder.push(`mount:${this.props.label}:${this.state.suffix}`);
    }

    public override componentDidUpdate(
        previousProps: LifecycleProps,
        previousState: LifecycleState,
        snapshot: unknown
    ): void {
        this.props.recorder.push(`update:${previousProps.label}:${previousState.suffix}:${String(snapshot)}`);
    }

    public override getSnapshotBeforeUpdate(previousProps: LifecycleProps): string {
        return `snapshot:${previousProps.label}${this.props.label.slice(0, 0)}`;
    }

    public override componentWillUnmount(): void {
        this.props.recorder.push(`unmount:${this.props.label}:${this.state.suffix}`);
    }
};

const Counter = class extends React.Component<EmptyProps, CounterState> {
    public constructor(props: EmptyProps) {
        super(props);

        this.state = { count: 0 };
    }

    public override render(): React.ReactNode {
        return React.createElement(
            'button',
            {
                onClick: () => {
                    this.setState({ count: 1 });
                    this.setState(function incrementCount(state) {
                        return { count: state.count + 1 };
                    });
                }
            },
            String(this.state.count)
        );
    }
};

type GatedPanelProps = {
    readonly value: string;
};

type PurePanelProps = {
    readonly label: string;
};

type BrokenProps = {
    readonly label: string;
};

type RefPanelProps = {
    readonly label: string;
};

type PanelFactory<Props> = {
    readonly Panel: React.ComponentType<Props>;
    readonly readRenders: () => number;
};

type RenderGateViews = {
    readonly gated: PanelFactory<GatedPanelProps>;
    readonly gatedView: IntrospectionView;
    readonly pure: PanelFactory<PurePanelProps>;
    readonly pureView: IntrospectionView;
};

type CallbackStore = {
    readonly read: () => unknown;
    readonly write: (value: unknown) => void;
};

type ClassRefState = {
    readonly callback: CallbackStore;
    readonly callbackView: IntrospectionView;
    readonly objectRef: React.RefObject<RefPanelInstance | null>;
    readonly objectView: IntrospectionView;
};

function createForcedPanel(): PanelFactory<EmptyProps> {
    let renders = 0;

    const Panel = class extends React.Component<EmptyProps> {
        public override shouldComponentUpdate(): boolean {
            return Object.is(this.props, undefined);
        }

        public override render(): React.ReactNode {
            renders += 1;

            return React.createElement('button', {
                onClick: () => {
                    this.forceUpdate();
                }
            }, String(renders));
        }
    };

    return {
        Panel,
        readRenders() {
            return renders;
        }
    };
}

function createGatedPanel(): PanelFactory<GatedPanelProps> {
    let renders = 0;

    const Panel = class extends React.Component<GatedPanelProps> {
        public override shouldComponentUpdate(nextProps: GatedPanelProps): boolean {
            return this.props.value !== nextProps.value && nextProps.value !== 'skip';
        }

        public override render(): React.ReactNode {
            renders += 1;

            return React.createElement('output', null, this.props.value);
        }
    };

    return {
        Panel,
        readRenders() {
            return renders;
        }
    };
}

function createPurePanel(): PanelFactory<PurePanelProps> {
    let renders = 0;

    const Panel = class extends React.PureComponent<PurePanelProps> {
        public override render(): React.ReactNode {
            renders += 1;

            return React.createElement('output', null, this.props.label);
        }
    };

    return {
        Panel,
        readRenders() {
            return renders;
        }
    };
}

function Bomb(): React.ReactNode {
    throw new Error('boom');
}

function StringBomb(): React.ReactNode {
    const cause: unknown = 'string boom';

    throw cause;
}

function UndefinedBomb(): React.ReactNode {
    const cause: unknown = undefined;

    throw cause;
}

const RefPanel = class extends React.Component<RefPanelProps> {
    public override render(): React.ReactNode {
        return React.createElement('output', null, this.props.label);
    }
};

type RefPanelInstance = InstanceType<typeof RefPanel>;

function createRefPanelProps(
    label: string,
    ref: React.RefObject<RefPanelInstance | null>
): React.ClassAttributes<RefPanelInstance> & RefPanelProps {
    return { label, ref };
}

function createLazyRefPanel(): typeof RefPanel {
    return {
        $$typeof: Symbol.for('react.lazy'),
        _init() {
            return RefPanel;
        },
        _payload: {}
    } as unknown as typeof RefPanel;
}

const PrimitivePureCounter = class extends React.PureComponent<EmptyProps, unknown> {
    public constructor(props: EmptyProps) {
        super(props);

        this.state = 0;
    }

    public override render(): React.ReactNode {
        return React.createElement('button', {
            onClick: () => {
                this.setState({ value: 1 });
            }
        }, typeof this.state === 'object' ? '1' : String(this.state));
    }
};

const ObjectPureCounter = class extends React.PureComponent<EmptyProps, CounterState> {
    public constructor(props: EmptyProps) {
        super(props);

        this.state = Object.freeze({ count: 0 });
    }

    public override render(): React.ReactNode {
        return React.createElement('button', {
            onClick: () => {
                this.setState({ count: 1 });
            }
        }, String(this.state.count));
    }
};

const BrokenClass = class extends React.Component<BrokenProps> {
    public override render(): React.ReactNode {
        throw new Error(`class render failed${this.props.label.slice(0, 0)}`);
    }
};

const Boundary = class extends React.Component<BoundaryProps, BoundaryState> {
    public constructor(props: BoundaryProps) {
        super(props);

        this.state = createBoundaryState(false);
    }

    public static getDerivedStateFromError(): BoundaryState {
        return { failed: true };
    }

    public override render(): React.ReactNode {
        return this.state.failed
            ? React.createElement('span', null, 'fallback')
            : this.props.children;
    }

    public override componentDidCatch(error: Error): void {
        this.props.recorder.push(error.message);
    }
};

const PropsGatedBoundary = class extends Boundary {
    public override shouldComponentUpdate(nextProps: BoundaryProps): boolean {
        this.props.recorder.push('shouldComponentUpdate');

        return nextProps.children !== this.props.children;
    }

    public override componentDidUpdate(): void {
        this.props.recorder.push('componentDidUpdate');
    }

    public override render(): React.ReactNode {
        this.props.recorder.push('render');

        return super.render();
    }
};

function ThrowsOnClick(): React.ReactNode {
    const [ armed, setArmed ] = React.useState(false);

    if (armed) {
        throw new Error('clicked into a crash');
    }

    return React.createElement('button', {
        onClick() {
            setArmed(true);
        }
    }, 'arm');
}

const FirstStatefulClass = class extends React.Component<EmptyProps, CounterState> {
    public constructor(props: EmptyProps) {
        super(props);

        this.state = { count: 1 };
    }

    public override render(): React.ReactNode {
        return React.createElement('output', null, `first ${this.state.count}`);
    }
};

const SecondStatefulClass = class extends React.Component<EmptyProps, CounterState> {
    public constructor(props: EmptyProps) {
        super(props);

        this.state = { count: 2 };
    }

    public override render(): React.ReactNode {
        return React.createElement('output', null, `second ${this.state.count}`);
    }
};

const PrimitiveBoundary = class extends React.Component<BoundaryProps, unknown> {
    public static getDerivedStateFromError(): string {
        return 'failed';
    }

    public override render(): React.ReactNode {
        return this.state === 'failed'
            ? React.createElement('span', null, 'primitive fallback')
            : this.props.children;
    }
};

const CatchOnlyBoundary = class extends React.Component<BoundaryProps, BoundaryState> {
    public constructor(props: BoundaryProps) {
        super(props);

        this.state = createPassingBoundaryState();
    }

    public override render(): React.ReactNode {
        return this.state.failed
            ? React.createElement('span', null, 'catch fallback')
            : this.props.children;
    }

    public override componentDidCatch(error: Error): void {
        this.props.recorder.push(error.message);
        this.setState({ failed: true }, () => {
            this.props.recorder.push('recovered');
        });
    }
};

function createRenderGateViews(): RenderGateViews {
    const gated = createGatedPanel();
    const pure = createPurePanel();

    return {
        gated,
        gatedView: introspect(React.createElement(gated.Panel, { value: 'one' }), {
            depth: 'full',
            strictMode: false
        }),
        pure,
        pureView: introspect(React.createElement(pure.Panel, { label: 'one' }), {
            depth: 'full',
            strictMode: false
        })
    };
}

function createClassRefState(): ClassRefState {
    let callbackValue: unknown = null;
    const callback = {
        read() {
            return callbackValue;
        },
        write(value: unknown) {
            callbackValue = value;
        }
    };
    const objectRef = React.createRef<RefPanelInstance>();
    const objectProps: React.ClassAttributes<RefPanelInstance> & RefPanelProps = {
        label: 'object',
        ref: objectRef
    };
    const callbackProps: React.ClassAttributes<RefPanelInstance> & RefPanelProps = {
        label: 'callback',
        ref(value) {
            callback.write(value);
        }
    };

    return {
        callback,
        callbackView: introspect(React.createElement(RefPanel, callbackProps), {
            depth: 'full',
            strictMode: false
        }),
        objectRef,
        objectView: introspect(React.createElement(RefPanel, objectProps), {
            depth: 'full',
            strictMode: false
        })
    };
}

export const testNode = suite('class components and error boundaries', [
    test('runs class lifecycles around committed renders', function (scope) {
        const recorder = createRecorder();
        const view = introspect(React.createElement(LifecyclePanel, { label: 'initial', recorder }), {
            depth: 'full',
            strictMode: false
        });

        const initialRootType = view.root?.type;
        const initialText = view.textContent;

        view.update(React.createElement(LifecyclePanel, { label: 'derived', recorder }));
        view.unmount();

        scope.assert.deepEqual({
            entries: recorder.entries,
            initialRootType,
            initialText,
            unmountedText: view.textContent
        }, {
            entries: [
                'render:initial:created',
                'mount:initial:created',
                'render:derived:derived',
                'update:initial:created:snapshot:initial',
                'unmount:derived:derived'
            ],
            initialRootType: LifecyclePanel,
            initialText: 'initial:created',
            unmountedText: ''
        });

        return scope.assert.collect();
    }),
    test('updates class state from event handlers', function (scope) {
        const view = introspect(React.createElement(Counter), {
            depth: 'full',
            strictMode: false
        });

        requireValue(view.find('button')).sendEvent('click');

        scope.assert.equal(view.textContent, '2');

        return scope.assert.collect();
    }),
    test('forces class renders through forceUpdate', function (scope) {
        const { Panel, readRenders } = createForcedPanel();
        const view = introspect(React.createElement(Panel), {
            depth: 'full',
            strictMode: false
        });

        requireValue(view.find('button')).sendEvent('click');

        scope.assert.equal(readRenders(), 2);
        scope.assert.equal(view.textContent, '2');

        return scope.assert.collect();
    }),
    test('honors class render gates', function (scope) {
        const { gated, gatedView, pure, pureView } = createRenderGateViews();

        gatedView.update(React.createElement(gated.Panel, { value: 'skip' }));
        pureView.update(React.createElement(pure.Panel, { label: 'one' }));
        pureView.update(React.createElement(pure.Panel, { label: 'two' }));

        scope.assert.equal(gated.readRenders(), 1);
        scope.assert.equal(requireValue(gatedView.find(gated.Panel)).props.value, 'skip');
        scope.assert.equal(gatedView.textContent, 'one');
        scope.assert.equal(pure.readRenders(), 2);
        scope.assert.equal(pureView.textContent, 'two');

        return scope.assert.collect();
    }),
    test('keeps handled boundary errors on the boundary node', function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(
                Boundary,
                { recorder },
                React.createElement(Bomb)
            ),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        scope.assert.deepEqual(recorder.entries, [ 'boom' ]);
        scope.assert.deepEqual(view.caughtErrors.map(readErrorMessage), [ 'boom' ]);
        scope.assert.equal(view.uncaughtErrors.length, 0);
        scope.assert.equal(view.root?.caughtError?.message, 'boom');
        scope.assert.equal(view.find('span')?.textContent, 'fallback');

        return scope.assert.collect();
    }),
    test('reports a boundary that caught an undefined error', function (scope) {
        const view = introspect(
            React.createElement(
                PrimitiveBoundary as never,
                { recorder: createRecorder() },
                React.createElement(UndefinedBomb)
            ),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        scope.assert.equal(view.caughtErrors.length, 1);
        scope.assert.equal(view.find('span')?.textContent, 'primitive fallback');
        scope.assert.equal(view.root?.caughtError?.message, 'undefined');

        return scope.assert.collect();
    }),
    test('notifies boundaries about errors caught during an update render', async function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(Boundary, { recorder }, React.createElement(RefPanel, { label: 'safe' })),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        view.update(React.createElement(Boundary, { recorder }, React.createElement(Bomb)));
        await view.waitForIdle();

        scope.assert.deepEqual(recorder.entries, [ 'boom' ]);
        scope.assert.deepEqual(view.caughtErrors.map(readErrorMessage), [ 'boom' ]);
        scope.assert.equal(view.root?.caughtError?.message, 'boom');
        scope.assert.equal(view.find('span')?.textContent, 'fallback');

        return scope.assert.collect();
    }),
    test('recovers catch-only boundaries from errors caught during an update render', async function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(CatchOnlyBoundary, { recorder }, React.createElement(RefPanel, { label: 'safe' })),
            {
                depth: 'full',
                errorMode: 'capture',
                warningMode: 'capture'
            }
        );

        view.update(React.createElement(CatchOnlyBoundary, { recorder }, React.createElement(Bomb)));
        await view.waitForIdle();

        scope.assert.deepEqual(recorder.entries, [ 'boom', 'recovered' ]);
        scope.assert.deepEqual(view.caughtErrors.map(readErrorMessage), [ 'boom' ]);
        scope.assert.equal(view.root?.caughtError?.message, 'boom');
        scope.assert.equal(view.find('span')?.textContent, 'catch fallback');

        return scope.assert.collect();
    }),
    test('renders the boundary fallback even when shouldComponentUpdate declines the capture render', function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(PropsGatedBoundary, { recorder }, React.createElement(ThrowsOnClick)),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        requireValue(view.find('button')).sendEvent('click');

        scope.assert.equal(view.find('span')?.textContent, 'fallback');
        scope.assert.undefined(view.find('button'));
        scope.assert.deepEqual({
            askedShouldComponentUpdate: recorder.entries.includes('shouldComponentUpdate'),
            caught: recorder.entries.includes('clicked into a crash'),
            ranComponentDidUpdate: recorder.entries.includes('componentDidUpdate')
        }, {
            askedShouldComponentUpdate: true,
            caught: true,
            ranComponentDidUpdate: false
        });

        return scope.assert.collect();
    }),
    test('lets shouldComponentUpdate gate boundary renders again after the capture render', function (scope) {
        const recorder = createRecorder();
        const child = React.createElement(ThrowsOnClick);
        const view = introspect(React.createElement(PropsGatedBoundary, { recorder }, child), {
            depth: 'full',
            errorMode: 'capture',
            strictMode: false,
            warningMode: 'capture'
        });

        requireValue(view.find('button')).sendEvent('click');

        const rendersAfterCapture = recorder.entries.length;

        view.update(React.createElement(PropsGatedBoundary, { recorder }, child));

        scope.assert.deepEqual(recorder.entries.slice(rendersAfterCapture), [ 'shouldComponentUpdate' ]);
        scope.assert.equal(view.find('span')?.textContent, 'fallback');

        return scope.assert.collect();
    }),
    test('executes class components wrapped in memo or lazy', function (scope) {
        const MemoPanel = React.memo(RefPanel);
        const LazyPanel = createLazyRefPanel();
        const memoRef = React.createRef<RefPanelInstance>();
        const lazyRef = React.createRef<RefPanelInstance>();
        const view = introspect(
            React.createElement(
                React.Fragment,
                null,
                React.createElement(MemoPanel, createRefPanelProps('memo', memoRef)),
                React.createElement(LazyPanel, createRefPanelProps('lazy', lazyRef))
            ),
            {
                depth: 'full',
                strictMode: false
            }
        );

        scope.assert.equal(view.textContent, 'memolazy');
        scope.assert.deepEqual([ memoRef.current?.props.label, lazyRef.current?.props.label ], [ 'memo', 'lazy' ]);
        scope.assert.equal(
            view.formatTree(),
            'Fragment\n  RefPanel\n    output\n      #text\n  RefPanel\n    output\n      #text'
        );

        return scope.assert.collect();
    }),
    test('remounts when a different class takes the same position', function (scope) {
        const view = introspect(React.createElement(FirstStatefulClass), {
            depth: 'full',
            strictMode: false
        });

        view.update(React.createElement(SecondStatefulClass));

        const memoView = introspect(React.createElement(React.memo(FirstStatefulClass)), {
            depth: 'full',
            strictMode: false
        });

        memoView.update(React.createElement(React.memo(SecondStatefulClass)));

        scope.assert.equal(view.find('output')?.textContent, 'second 2');
        scope.assert.equal(memoView.find('output')?.textContent, 'second 2');

        return scope.assert.collect();
    }),
    test('captures uncaught class render errors', function (scope) {
        const view = introspect(React.createElement(BrokenClass, { label: 'broken' }), {
            depth: 'full',
            errorMode: 'capture',
            strictMode: false,
            warningMode: 'capture'
        });

        scope.assert.deepEqual(view.uncaughtErrors.map(readErrorMessage), [ 'class render failed' ]);
        scope.assert.equal(view.caughtErrors.length, 0);
        scope.assert.undefined(view.root);

        return scope.assert.collect();
    }),
    test('attaches refs to executed class instances', function (scope) {
        const state = createClassRefState();
        const objectRefIsComponent = state.objectRef.current instanceof React.Component;
        const callbackRefIsComponent = state.callback.read() instanceof React.Component;

        state.objectView.unmount();
        state.callbackView.unmount();

        scope.assert.true(objectRefIsComponent);
        scope.assert.true(callbackRefIsComponent);
        scope.assert.null(state.objectRef.current);
        scope.assert.null(state.callback.read());

        return scope.assert.collect();
    }),
    test('updates primitive PureComponent state', function (scope) {
        const view = introspect(React.createElement(PrimitivePureCounter), {
            depth: 'full',
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        scope.assert.equal(view.textContent, '1');

        return scope.assert.collect();
    }),
    test('updates object PureComponent state', function (scope) {
        const view = introspect(React.createElement(ObjectPureCounter), {
            depth: 'full',
            strictMode: false
        });
        const button = requireValue(view.find('button'));

        button.sendEvent('click');

        scope.assert.equal(view.textContent, '1');

        return scope.assert.collect();
    }),
    test('handles primitive boundary state', function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(
                PrimitiveBoundary as never,
                { recorder },
                React.createElement(StringBomb)
            ),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        scope.assert.equal(view.root?.caughtError?.message, 'string boom');
        scope.assert.equal(view.find('span')?.textContent, 'primitive fallback');

        return scope.assert.collect();
    }),
    test('handles componentDidCatch recovery', function (scope) {
        const recorder = createRecorder();
        const view = introspect(
            React.createElement(
                CatchOnlyBoundary,
                { recorder },
                React.createElement(Bomb)
            ),
            {
                depth: 'full',
                errorMode: 'capture',
                strictMode: false,
                warningMode: 'capture'
            }
        );

        scope.assert.deepEqual(recorder.entries, [ 'boom', 'recovered' ]);
        scope.assert.equal(view.root?.caughtError?.message, 'boom');
        scope.assert.equal(view.find('span')?.textContent, 'catch fallback');

        return scope.assert.collect();
    })
]);
