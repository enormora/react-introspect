import React from 'react';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    nextDepth,
    type ProbeElement,
    type ProbeFrameDepth,
    type ProbeTransformedNode,
    readElementProps,
    readElementRef,
    throwProbeRenderError
} from './probe-frame-contract.ts';
import type { ProbeError } from './probe-public-types.ts';

type ProbeFrameElementFactory = (element: ProbeElement, depth: ProbeFrameDepth) => React.ReactElement;

type ProbeTransformNode = (
    node: unknown,
    depth: ProbeFrameDepth,
    createFrameElement: ProbeFrameElementFactory
) => ProbeTransformedNode;

export type ProbeClassFrameProps = {
    readonly createFrameElement: ProbeFrameElementFactory;
    readonly depth: ProbeFrameDepth;
    readonly element: ProbeElement;
    readonly transformNode: ProbeTransformNode;
    readonly type: ProbeClassComponent;
};

type ProbeClassComponent = {
    readonly getDerivedStateFromError?: (error: unknown) => unknown;
    readonly getDerivedStateFromProps?: (
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ) => unknown;
    readonly prototype: {
        readonly componentDidCatch?: (error: unknown, errorInfo: unknown) => void;
        readonly isReactComponent?: unknown;
    };
    new (
        props: Readonly<Record<PropertyKey, unknown>>,
        context: unknown
    ): ProbeClassInstance;
};

type ProbeClassUpdater = {
    readonly enqueueForceUpdate: (
        instance: unknown,
        callback: (() => void) | undefined
    ) => void;
    readonly enqueueSetState: (
        instance: unknown,
        state: unknown,
        callback: (() => void) | undefined
    ) => void;
};

type ProbeClassInstance = React.Component<Readonly<Record<PropertyKey, unknown>>, unknown> & {
    readonly componentDidCatch?: (error: unknown, errorInfo: unknown) => void;
    readonly componentDidMount?: () => void;
    readonly componentDidUpdate?: (props: unknown, state: unknown, snapshot: unknown) => void;
    readonly componentWillUnmount?: () => void;
    readonly context: unknown;
    readonly getSnapshotBeforeUpdate?: (props: unknown, state: unknown) => unknown;
    readonly isPureReactComponent?: boolean;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly refs: Readonly<Record<PropertyKey, unknown>>;
    readonly render: () => React.ReactNode;
    readonly shouldComponentUpdate?: (props: unknown, state: unknown, context: unknown) => boolean;
    readonly state: unknown;
    readonly updater: ProbeClassUpdater;
};

type ProbeClassFrameState = {
    readonly boundaryErrorCause: unknown;
    readonly revision: number;
};

type ProbeStateUpdate = (props: Readonly<Record<PropertyKey, unknown>>, state: unknown) => unknown;

type ProbeStateUpdateFactory = (
    state: unknown,
    props: Readonly<Record<PropertyKey, unknown>>
) => unknown;

type ProbeClassLifecycle = {
    readonly previousProps: Readonly<Record<PropertyKey, unknown>>;
    readonly previousState: unknown;
    readonly shouldCommit: boolean;
};

const emptyErrorInfo = Object.freeze({ componentStack: '' });
const noCatchOnlyBoundaryRecovery = Symbol('noCatchOnlyBoundaryRecovery');
const catchOnlyBoundaryRecoveries = new WeakMap<ProbeClassComponent, Map<string, unknown>>();

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

export function isClassComponent(value: unknown): value is ProbeClassComponent {
    const prototype: unknown = typeof value === 'function' ? Reflect.get(value, 'prototype') : undefined;

    return isRecord(prototype) && prototype.isReactComponent !== undefined;
}

function isErrorBoundary(type: ProbeClassComponent): boolean {
    return typeof type.getDerivedStateFromError === 'function' ||
        typeof type.prototype.componentDidCatch === 'function';
}

function createProbeError(cause: unknown, handled: boolean): ProbeError {
    return Object.freeze({
        cause,
        handled,
        message: cause instanceof Error ? cause.message : String(cause)
    });
}

function shallowEquals(
    left: Readonly<Record<PropertyKey, unknown>>,
    right: Readonly<Record<PropertyKey, unknown>>
): boolean {
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);

    return leftKeys.length === rightKeys.length &&
        leftKeys.every(function hasSameValue(key) {
            return Object.is(left[key], right[key]);
        });
}

function shallowStateEquals(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }

    return isRecord(left) && isRecord(right) ? shallowEquals(left, right) : false;
}

function mergeState(state: unknown, partialState: unknown): unknown {
    if (partialState === null || partialState === undefined) {
        return state;
    }

    const baseState = isRecord(state) ? state : {};

    return isRecord(partialState)
        ? Object.freeze({
            ...baseState,
            ...partialState
        })
        : partialState;
}

function isStateUpdateFactory(value: unknown): value is ProbeStateUpdateFactory {
    return typeof value === 'function';
}

function toStateUpdate(partialState: unknown): ProbeStateUpdate {
    if (isStateUpdateFactory(partialState)) {
        return function resolveStateUpdate(props, state) {
            return partialState(state, props);
        };
    }

    return function readStateUpdate() {
        return partialState;
    };
}

function applyStateUpdates(
    props: Readonly<Record<PropertyKey, unknown>>,
    state: unknown,
    updates: readonly ProbeStateUpdate[]
): unknown {
    return updates.reduce(function applyUpdate(nextState, update) {
        return mergeState(nextState, update(props, nextState));
    }, state);
}

function readDerivedState(
    type: ProbeClassComponent,
    props: Readonly<Record<PropertyKey, unknown>>,
    state: unknown
): unknown {
    return typeof type.getDerivedStateFromProps === 'function'
        ? mergeState(state, type.getDerivedStateFromProps(props, state))
        : state;
}

function assignClassField(instance: ProbeClassInstance, property: PropertyKey, value: unknown): void {
    Reflect.set(instance, property, value);
}

function applyElementRef(ref: unknown, value: ProbeClassInstance | null): void {
    if (typeof ref === 'function') {
        Reflect.apply(ref, undefined, [ value ]);

        return;
    }

    if (isRecord(ref)) {
        Reflect.set(ref, 'current', value);
    }
}

function executeProbeClassRender(instance: ProbeClassInstance): React.ReactNode {
    try {
        return instance.render();
    } catch (error) {
        return throwProbeRenderError(error);
    }
}

function notifyCatchBoundary(
    type: ProbeClassComponent,
    instance: ProbeClassInstance,
    error: unknown
): void {
    type.prototype.componentDidCatch?.call(instance, error, emptyErrorInfo);
}

function readCatchOnlyBoundaryRecoveries(type: ProbeClassComponent): Map<string, unknown> {
    let recoveries = catchOnlyBoundaryRecoveries.get(type);

    if (recoveries === undefined) {
        recoveries = new Map();
        catchOnlyBoundaryRecoveries.set(type, recoveries);
    }

    return recoveries;
}

function readCatchOnlyBoundaryRecovery(type: ProbeClassComponent, key: string): unknown {
    const recoveries = readCatchOnlyBoundaryRecoveries(type);

    return recoveries.has(key) ? recoveries.get(key) : noCatchOnlyBoundaryRecovery;
}

function writeCatchOnlyBoundaryRecovery(type: ProbeClassComponent, key: string, state: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).set(key, state);
}

function deleteCatchOnlyBoundaryRecovery(type: ProbeClassComponent, error: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).delete(String(error));
}

const ProbeClassFrameBase = class extends React.Component<ProbeClassFrameProps, ProbeClassFrameState> {
    protected appliedBoundaryErrorCause: unknown;
    protected boundaryError: ProbeError | undefined;
    protected isApplyingBoundaryError = false;
    protected lifecycle: ProbeClassLifecycle | undefined;
    protected pendingStateUpdates: readonly ProbeStateUpdate[];
    protected renderedNode: ProbeTransformedNode;
    protected shouldForceRender: boolean;
    protected userInstance: ProbeClassInstance | undefined;

    public constructor(props: ProbeClassFrameProps) {
        super(props);

        this.appliedBoundaryErrorCause = undefined;
        this.boundaryError = undefined;
        this.lifecycle = undefined;
        this.pendingStateUpdates = Object.freeze([]);
        this.renderedNode = createEmptyHost(undefined);
        this.shouldForceRender = false;
        this.state = Object.freeze({
            boundaryErrorCause: undefined,
            revision: 0
        });
        this.userInstance = undefined;
    }

    public override render(): React.ReactElement {
        const props = readElementProps(this.props.element);
        const instance = this.readUserInstance();
        const renderedNode = this.readRenderedNode(instance, props, this.readNextState(instance, props));

        return createComponentHost(
            createComponentMetadata(this.props.element, undefined, this.boundaryError),
            renderedNode
        );
    }

    public override componentDidMount(): void {
        const instance = this.readUserInstance();

        applyElementRef(readElementRef(this.props.element), instance);
        instance.componentDidMount?.();
    }

    public override componentDidUpdate(
        _previousProps: ProbeClassFrameProps,
        _previousState: ProbeClassFrameState,
        snapshot: unknown
    ): void {
        const { lifecycle } = this;

        applyElementRef(readElementRef(this.props.element), this.readUserInstance());

        if (lifecycle?.shouldCommit === true) {
            this.readUserInstance().componentDidUpdate?.(
                lifecycle.previousProps,
                lifecycle.previousState,
                snapshot
            );
        }
    }

    public override getSnapshotBeforeUpdate(): unknown {
        const { lifecycle } = this;

        if (lifecycle?.shouldCommit !== true) {
            return null;
        }

        return this
            .readUserInstance()
            .getSnapshotBeforeUpdate?.(lifecycle.previousProps, lifecycle.previousState) ?? null;
    }

    public override componentWillUnmount(): void {
        const instance = this.readUserInstance();

        instance.componentWillUnmount?.();
        applyElementRef(readElementRef(this.props.element), null);
    }

    protected readBoundaryState(
        _instance: ProbeClassInstance,
        _type: ProbeClassComponent,
        state: unknown
    ): unknown {
        Object.is(this.userInstance, undefined);

        return state;
    }

    protected clearQueuedUpdates(): void {
        this.pendingStateUpdates = Object.freeze([]);
        this.shouldForceRender = false;
    }

    protected createUpdater(): ProbeClassUpdater {
        return {
            enqueueForceUpdate: (_instance: unknown, callback: (() => void) | undefined) => {
                this.shouldForceRender = true;
                this.setState(function incrementRevision(state) {
                    return { revision: state.revision + 1 };
                }, callback);
            },
            enqueueSetState: (_instance: unknown, partialState: unknown, callback: (() => void) | undefined) => {
                this.pendingStateUpdates = [
                    ...this.pendingStateUpdates,
                    toStateUpdate(partialState)
                ];

                if (this.isApplyingBoundaryError) {
                    callback?.();

                    return;
                }

                this.setState(function incrementRevision(currentState) {
                    return { revision: currentState.revision + 1 };
                }, callback);
            }
        };
    }

    protected shouldRender(
        instance: ProbeClassInstance,
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): boolean {
        if (this.shouldForceRender || this.lifecycle === undefined) {
            return true;
        }

        if (typeof instance.shouldComponentUpdate === 'function') {
            return instance.shouldComponentUpdate(props, state, instance.context);
        }

        if (instance.isPureReactComponent === true) {
            return !shallowEquals(instance.props, props) || !shallowStateEquals(instance.state, state);
        }

        return true;
    }

    protected readNextState(instance: ProbeClassInstance, props: Readonly<Record<PropertyKey, unknown>>): unknown {
        const updatedState = applyStateUpdates(props, instance.state, this.pendingStateUpdates);
        const boundaryState = this.readBoundaryState(instance, this.props.type, updatedState);

        return readDerivedState(this.props.type, props, boundaryState);
    }

    protected readRenderedNode(
        instance: ProbeClassInstance,
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): ProbeTransformedNode {
        const shouldRender = this.shouldRender(instance, props, state);

        this.lifecycle = Object.freeze({
            previousProps: instance.props,
            previousState: instance.state,
            shouldCommit: shouldRender
        });
        assignClassField(instance, 'props', props);
        assignClassField(instance, 'state', state);
        this.clearQueuedUpdates();

        if (shouldRender) {
            this.renderedNode = this.props.transformNode(
                executeProbeClassRender(instance),
                nextDepth(this.props.depth),
                this.props.createFrameElement
            );
        }

        return this.renderedNode;
    }

    protected readUserInstance(): ProbeClassInstance {
        if (this.userInstance !== undefined) {
            return this.userInstance;
        }

        const ClassComponent = this.props.type;
        const instance = new ClassComponent(readElementProps(this.props.element), undefined);

        assignClassField(instance, 'updater', this.createUpdater());
        assignClassField(instance, 'refs', {});
        assignClassField(
            instance,
            'state',
            readDerivedState(ClassComponent, readElementProps(this.props.element), instance.state)
        );
        this.userInstance = instance;

        return instance;
    }
};

const ProbeClassBoundaryFrame = class extends ProbeClassFrameBase {
    public static getDerivedStateFromError(error: unknown): ProbeClassFrameState {
        return {
            boundaryErrorCause: error,
            revision: 0
        };
    }

    public override componentDidCatch(error: unknown, errorInfo: unknown): void {
        const instance = this.readUserInstance();

        if (typeof this.props.type.getDerivedStateFromError === 'function') {
            instance.componentDidCatch?.(error, errorInfo);
        } else {
            deleteCatchOnlyBoundaryRecovery(this.props.type, error);
        }

        this.boundaryError = createProbeError(error, true);
    }

    protected applyCatchOnlyBoundaryState(
        instance: ProbeClassInstance,
        type: ProbeClassComponent,
        state: unknown,
        error: unknown
    ): unknown {
        const recoveryKey = String(error);
        const recoveredState = readCatchOnlyBoundaryRecovery(type, recoveryKey);

        if (recoveredState !== noCatchOnlyBoundaryRecovery) {
            return recoveredState;
        }

        this.isApplyingBoundaryError = true;

        try {
            notifyCatchBoundary(type, instance, error);
        } finally {
            this.isApplyingBoundaryError = false;
        }

        return this.createCatchOnlyBoundaryState(type, recoveryKey, state);
    }

    protected createCatchOnlyBoundaryState(type: ProbeClassComponent, key: string, state: unknown): unknown {
        const nextState = applyStateUpdates(readElementProps(this.props.element), state, this.pendingStateUpdates);

        writeCatchOnlyBoundaryRecovery(type, key, nextState);

        return nextState;
    }

    protected override readBoundaryState(
        instance: ProbeClassInstance,
        type: ProbeClassComponent,
        state: unknown
    ): unknown {
        const { boundaryErrorCause } = this.state;

        if (boundaryErrorCause === undefined || this.appliedBoundaryErrorCause === boundaryErrorCause) {
            return state;
        }

        this.appliedBoundaryErrorCause = boundaryErrorCause;
        this.boundaryError = createProbeError(boundaryErrorCause, true);

        if (typeof type.getDerivedStateFromError !== 'function') {
            return this.applyCatchOnlyBoundaryState(instance, type, state, boundaryErrorCause);
        }

        return mergeState(
            state,
            type.getDerivedStateFromError(boundaryErrorCause)
        );
    }
};

export function readClassFrameType(
    type: ProbeClassComponent
): React.ComponentType<ProbeClassFrameProps> {
    return isErrorBoundary(type) ? ProbeClassBoundaryFrame : ProbeClassFrameBase;
}
