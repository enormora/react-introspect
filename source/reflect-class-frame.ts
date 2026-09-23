import React from 'react';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    nextDepth,
    type ReflectElement,
    type ReflectFrameDepth,
    type ReflectTransformedNode,
    readElementProps,
    readElementRef,
    throwReflectRenderError
} from './reflect-frame-contract.ts';
import type { ReflectError } from './reflect-public-types.ts';

type ReflectFrameElementFactory = (element: ReflectElement, depth: ReflectFrameDepth) => React.ReactElement;

type ReflectTransformNode = (
    node: unknown,
    depth: ReflectFrameDepth,
    createFrameElement: ReflectFrameElementFactory
) => ReflectTransformedNode;

export type ReflectClassFrameProps = {
    readonly createFrameElement: ReflectFrameElementFactory;
    readonly depth: ReflectFrameDepth;
    readonly element: ReflectElement;
    readonly transformNode: ReflectTransformNode;
    readonly type: ReflectClassComponent;
};

type ReflectClassComponent = {
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
    ): ReflectClassInstance;
};

type ReflectClassUpdater = {
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

type ReflectClassInstance = React.Component<Readonly<Record<PropertyKey, unknown>>, unknown> & {
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
    readonly updater: ReflectClassUpdater;
};

type ReflectClassFrameState = {
    readonly boundaryErrorCause: unknown;
    readonly revision: number;
};

type ReflectStateUpdate = (props: Readonly<Record<PropertyKey, unknown>>, state: unknown) => unknown;

type ReflectStateUpdateFactory = (
    state: unknown,
    props: Readonly<Record<PropertyKey, unknown>>
) => unknown;

type ReflectClassLifecycle = {
    readonly previousProps: Readonly<Record<PropertyKey, unknown>>;
    readonly previousState: unknown;
    readonly shouldCommit: boolean;
};

const emptyErrorInfo = Object.freeze({ componentStack: '' });
const noCatchOnlyBoundaryRecovery = Symbol('noCatchOnlyBoundaryRecovery');
const catchOnlyBoundaryRecoveries = new WeakMap<ReflectClassComponent, Map<string, unknown>>();

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

export function isClassComponent(value: unknown): value is ReflectClassComponent {
    const prototype: unknown = typeof value === 'function' ? Reflect.get(value, 'prototype') : undefined;

    return isRecord(prototype) && prototype.isReactComponent !== undefined;
}

function isErrorBoundary(type: ReflectClassComponent): boolean {
    return typeof type.getDerivedStateFromError === 'function' ||
        typeof type.prototype.componentDidCatch === 'function';
}

function createReflectError(cause: unknown, handled: boolean): ReflectError {
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

function isStateUpdateFactory(value: unknown): value is ReflectStateUpdateFactory {
    return typeof value === 'function';
}

function toStateUpdate(partialState: unknown): ReflectStateUpdate {
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
    updates: readonly ReflectStateUpdate[]
): unknown {
    return updates.reduce(function applyUpdate(nextState, update) {
        return mergeState(nextState, update(props, nextState));
    }, state);
}

function readDerivedState(
    type: ReflectClassComponent,
    props: Readonly<Record<PropertyKey, unknown>>,
    state: unknown
): unknown {
    return typeof type.getDerivedStateFromProps === 'function'
        ? mergeState(state, type.getDerivedStateFromProps(props, state))
        : state;
}

function assignClassField(instance: ReflectClassInstance, property: PropertyKey, value: unknown): void {
    Reflect.set(instance, property, value);
}

function applyElementRef(ref: unknown, value: ReflectClassInstance | null): void {
    if (typeof ref === 'function') {
        Reflect.apply(ref, undefined, [ value ]);

        return;
    }

    if (isRecord(ref)) {
        Reflect.set(ref, 'current', value);
    }
}

function executeReflectClassRender(instance: ReflectClassInstance): React.ReactNode {
    try {
        return instance.render();
    } catch (error) {
        return throwReflectRenderError(error);
    }
}

function notifyCatchBoundary(
    type: ReflectClassComponent,
    instance: ReflectClassInstance,
    error: unknown
): void {
    type.prototype.componentDidCatch?.call(instance, error, emptyErrorInfo);
}

function readCatchOnlyBoundaryRecoveries(type: ReflectClassComponent): Map<string, unknown> {
    let recoveries = catchOnlyBoundaryRecoveries.get(type);

    if (recoveries === undefined) {
        recoveries = new Map();
        catchOnlyBoundaryRecoveries.set(type, recoveries);
    }

    return recoveries;
}

function readCatchOnlyBoundaryRecovery(type: ReflectClassComponent, key: string): unknown {
    const recoveries = readCatchOnlyBoundaryRecoveries(type);

    return recoveries.has(key) ? recoveries.get(key) : noCatchOnlyBoundaryRecovery;
}

function writeCatchOnlyBoundaryRecovery(type: ReflectClassComponent, key: string, state: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).set(key, state);
}

function deleteCatchOnlyBoundaryRecovery(type: ReflectClassComponent, error: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).delete(String(error));
}

const ReflectClassFrameBase = class extends React.Component<ReflectClassFrameProps, ReflectClassFrameState> {
    protected appliedBoundaryErrorCause: unknown;
    protected boundaryError: ReflectError | undefined;
    protected isApplyingBoundaryError = false;
    protected lifecycle: ReflectClassLifecycle | undefined;
    protected pendingStateUpdates: readonly ReflectStateUpdate[];
    protected renderedNode: ReflectTransformedNode;
    protected shouldForceRender: boolean;
    protected userInstance: ReflectClassInstance | undefined;

    public constructor(props: ReflectClassFrameProps) {
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
        _previousProps: ReflectClassFrameProps,
        _previousState: ReflectClassFrameState,
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
        _instance: ReflectClassInstance,
        _type: ReflectClassComponent,
        state: unknown
    ): unknown {
        Object.is(this.userInstance, undefined);

        return state;
    }

    protected clearQueuedUpdates(): void {
        this.pendingStateUpdates = Object.freeze([]);
        this.shouldForceRender = false;
    }

    protected createUpdater(): ReflectClassUpdater {
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
        instance: ReflectClassInstance,
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

    protected readNextState(instance: ReflectClassInstance, props: Readonly<Record<PropertyKey, unknown>>): unknown {
        const updatedState = applyStateUpdates(props, instance.state, this.pendingStateUpdates);
        const boundaryState = this.readBoundaryState(instance, this.props.type, updatedState);

        return readDerivedState(this.props.type, props, boundaryState);
    }

    protected readRenderedNode(
        instance: ReflectClassInstance,
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): ReflectTransformedNode {
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
                executeReflectClassRender(instance),
                nextDepth(this.props.depth),
                this.props.createFrameElement
            );
        }

        return this.renderedNode;
    }

    protected readUserInstance(): ReflectClassInstance {
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

const ReflectClassBoundaryFrame = class extends ReflectClassFrameBase {
    public static getDerivedStateFromError(error: unknown): ReflectClassFrameState {
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

        this.boundaryError = createReflectError(error, true);
    }

    protected applyCatchOnlyBoundaryState(
        instance: ReflectClassInstance,
        type: ReflectClassComponent,
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

    protected createCatchOnlyBoundaryState(type: ReflectClassComponent, key: string, state: unknown): unknown {
        const nextState = applyStateUpdates(readElementProps(this.props.element), state, this.pendingStateUpdates);

        writeCatchOnlyBoundaryRecovery(type, key, nextState);

        return nextState;
    }

    protected override readBoundaryState(
        instance: ReflectClassInstance,
        type: ReflectClassComponent,
        state: unknown
    ): unknown {
        const { boundaryErrorCause } = this.state;

        if (boundaryErrorCause === undefined || this.appliedBoundaryErrorCause === boundaryErrorCause) {
            return state;
        }

        this.appliedBoundaryErrorCause = boundaryErrorCause;
        this.boundaryError = createReflectError(boundaryErrorCause, true);

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
    type: ReflectClassComponent
): React.ComponentType<ReflectClassFrameProps> {
    return isErrorBoundary(type) ? ReflectClassBoundaryFrame : ReflectClassFrameBase;
}
