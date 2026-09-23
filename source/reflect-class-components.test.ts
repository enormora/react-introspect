import { suite, test } from '@overkill-dev/test';
import React from 'react';
import type { ReflectView } from './reflect-public-types.ts';
import { reflect } from './react-reflect.entry-point.ts';

type EqualScope = {
    readonly assert: {
        readonly deepEqual: (actual: unknown, expected: unknown) => void;
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

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

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function createRecorder(): Recorder {
    const entries: string[] = [];

    return Object.freeze({
        get entries() {
            return Object.freeze(entries.slice());
        },
        push(entry: string) {
            entries.push(entry);
        }
    });
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
    readonly gatedView: ReflectView;
    readonly pure: PanelFactory<PurePanelProps>;
    readonly pureView: ReflectView;
};

type CallbackStore = {
    readonly read: () => unknown;
    readonly write: (value: unknown) => void;
};

type ClassRefState = {
    readonly callback: CallbackStore;
    readonly callbackView: ReflectView;
    readonly objectRef: React.RefObject<RefPanelInstance | null>;
    readonly objectView: ReflectView;
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

    return Object.freeze({
        Panel,
        readRenders() {
            return renders;
        }
    });
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

    return Object.freeze({
        Panel,
        readRenders() {
            return renders;
        }
    });
}

function createPurePanel(): PanelFactory<PurePanelProps> {
    let renders = 0;

    const Panel = class extends React.PureComponent<PurePanelProps> {
        public override render(): React.ReactNode {
            renders += 1;

            return React.createElement('output', null, this.props.label);
        }
    };

    return Object.freeze({
        Panel,
        readRenders() {
            return renders;
        }
    });
}

function Bomb(): React.ReactNode {
    throw new Error('boom');
}

function StringBomb(): React.ReactNode {
    const cause: unknown = 'string boom';

    throw cause;
}

const RefPanel = class extends React.Component<RefPanelProps> {
    public override render(): React.ReactNode {
        return React.createElement('output', null, this.props.label);
    }
};

type RefPanelInstance = InstanceType<typeof RefPanel>;

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

function assertLifecycle(scope: EqualScope): void {
    const recorder = createRecorder();
    const view = reflect(React.createElement(LifecyclePanel, { label: 'initial', recorder }), {
        depth: 'full',
        strictMode: false
    });

    scope.assert.equal(view.root?.type, LifecyclePanel);
    scope.assert.equal(view.textContent, 'initial:created');

    view.update(React.createElement(LifecyclePanel, { label: 'derived', recorder }));
    view.unmount();

    scope.assert.equal(view.textContent, '');
    scope.assert.deepEqual(recorder.entries, [
        'render:initial:created',
        'mount:initial:created',
        'render:derived:derived',
        'update:initial:created:snapshot:initial',
        'unmount:derived:derived'
    ]);
}

function assertStateUpdates(scope: EqualScope): void {
    const view = reflect(React.createElement(Counter), {
        depth: 'full',
        strictMode: false
    });

    requireValue(view.find('button')).sendEvent('click');

    scope.assert.equal(view.textContent, '2');
}

function assertForceUpdate(scope: EqualScope): void {
    const { Panel, readRenders } = createForcedPanel();
    const view = reflect(React.createElement(Panel), {
        depth: 'full',
        strictMode: false
    });

    requireValue(view.find('button')).sendEvent('click');

    scope.assert.equal(readRenders(), 2);
    scope.assert.equal(view.textContent, '2');
}

function createRenderGateViews(): RenderGateViews {
    const gated = createGatedPanel();
    const pure = createPurePanel();

    return Object.freeze({
        gated,
        gatedView: reflect(React.createElement(gated.Panel, { value: 'one' }), {
            depth: 'full',
            strictMode: false
        }),
        pure,
        pureView: reflect(React.createElement(pure.Panel, { label: 'one' }), {
            depth: 'full',
            strictMode: false
        })
    });
}

function assertRenderGates(scope: EqualScope): void {
    const { gated, gatedView, pure, pureView } = createRenderGateViews();

    gatedView.update(React.createElement(gated.Panel, { value: 'skip' }));
    pureView.update(React.createElement(pure.Panel, { label: 'one' }));
    pureView.update(React.createElement(pure.Panel, { label: 'two' }));

    scope.assert.equal(gated.readRenders(), 1);
    scope.assert.equal(requireValue(gatedView.find(gated.Panel)).props.value, 'skip');
    scope.assert.equal(gatedView.textContent, 'one');
    scope.assert.equal(pure.readRenders(), 2);
    scope.assert.equal(pureView.textContent, 'two');
}

function assertErrorBoundary(scope: EqualScope): void {
    const recorder = createRecorder();
    const view = reflect(
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
    scope.assert.equal(view.errors.length, 0);
    scope.assert.equal(view.root?.error?.message, 'boom');
    scope.assert.equal(view.root?.error?.handled, true);
    scope.assert.equal(view.find('span')?.textContent, 'fallback');
}

function assertPrimitiveBoundaryState(scope: EqualScope): void {
    const recorder = createRecorder();
    const view = reflect(
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

    scope.assert.equal(view.root?.error?.message, 'string boom');
    scope.assert.equal(view.find('span')?.textContent, 'primitive fallback');
}

function assertCatchOnlyBoundary(scope: EqualScope): void {
    const recorder = createRecorder();
    const view = reflect(
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
    scope.assert.equal(view.root?.error?.message, 'boom');
    scope.assert.equal(view.root?.error?.handled, true);
    scope.assert.equal(view.find('span')?.textContent, 'catch fallback');
}

function assertClassRenderError(scope: EqualScope): void {
    const view = reflect(React.createElement(BrokenClass, { label: 'broken' }), {
        depth: 'full',
        errorMode: 'capture',
        strictMode: false,
        warningMode: 'capture'
    });

    scope.assert.equal(view.errors.length, 1);
    scope.assert.equal(view.errors[0]?.message, 'class render failed');
    scope.assert.equal(view.root, undefined);
}

function createClassRefState(): ClassRefState {
    let callbackValue: unknown = null;
    const callback = Object.freeze({
        read() {
            return callbackValue;
        },
        write(value: unknown) {
            callbackValue = value;
        }
    });
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

    return Object.freeze({
        callback,
        callbackView: reflect(React.createElement(RefPanel, callbackProps), {
            depth: 'full',
            strictMode: false
        }),
        objectRef,
        objectView: reflect(React.createElement(RefPanel, objectProps), {
            depth: 'full',
            strictMode: false
        })
    });
}

function assertClassRefs(scope: EqualScope): void {
    const state = createClassRefState();

    scope.assert.equal(state.objectRef.current instanceof React.Component, true);
    scope.assert.equal(state.callback.read() instanceof React.Component, true);

    state.objectView.unmount();
    state.callbackView.unmount();

    scope.assert.equal(state.objectRef.current, null);
    scope.assert.equal(state.callback.read(), null);
}

function assertPrimitivePureState(scope: EqualScope): void {
    const view = reflect(React.createElement(PrimitivePureCounter), {
        depth: 'full',
        strictMode: false
    });
    const button = requireValue(view.find('button'));

    button.sendEvent('click');

    scope.assert.equal(view.textContent, '1');
}

function assertObjectPureState(scope: EqualScope): void {
    const view = reflect(React.createElement(ObjectPureCounter), {
        depth: 'full',
        strictMode: false
    });
    const button = requireValue(view.find('button'));

    button.sendEvent('click');

    scope.assert.equal(view.textContent, '1');
}

export const testNode = suite('class components and error boundaries', [
    test('runs class lifecycles around committed renders', function verifyLifecycles(scope) {
        assertLifecycle(scope);

        return scope.assert.collect();
    }),
    test('updates class state from event handlers', function verifyStateUpdates(scope) {
        assertStateUpdates(scope);

        return scope.assert.collect();
    }),
    test('forces class renders through forceUpdate', function verifyForceUpdate(scope) {
        assertForceUpdate(scope);

        return scope.assert.collect();
    }),
    test('honors class render gates', function verifyRenderGates(scope) {
        assertRenderGates(scope);

        return scope.assert.collect();
    }),
    test('keeps handled boundary errors on the boundary node', function verifyErrorBoundary(scope) {
        assertErrorBoundary(scope);

        return scope.assert.collect();
    }),
    test('captures uncaught class render errors', function verifyClassRenderError(scope) {
        assertClassRenderError(scope);

        return scope.assert.collect();
    }),
    test('attaches refs to executed class instances', function verifyClassRefs(scope) {
        assertClassRefs(scope);

        return scope.assert.collect();
    }),
    test('updates primitive PureComponent state', function verifyPrimitivePureState(scope) {
        assertPrimitivePureState(scope);

        return scope.assert.collect();
    }),
    test('updates object PureComponent state', function verifyObjectPureState(scope) {
        assertObjectPureState(scope);

        return scope.assert.collect();
    }),
    test('handles primitive boundary state', function verifyPrimitiveBoundaryState(scope) {
        assertPrimitiveBoundaryState(scope);

        return scope.assert.collect();
    }),
    test('handles componentDidCatch recovery', function verifyCatchOnlyBoundary(scope) {
        assertCatchOnlyBoundary(scope);

        return scope.assert.collect();
    })
]);
