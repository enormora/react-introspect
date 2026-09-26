import React from 'react';
import type { IntrospectionError } from '../../public/introspect-public-types.ts';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    nextDepth,
    type IntrospectionElement,
    type IntrospectionFrameElementFactory,
    type IntrospectionFrameDepth,
    type IntrospectionTransformedNode,
    type IntrospectionTransformNode,
    readElementProps,
    readElementRef,
    throwIntrospectionRenderError
} from './introspect-frame-contract.ts';

export type IntrospectionClassFrameProps = {
    readonly createFrameElement: IntrospectionFrameElementFactory;
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
    readonly transformNode: IntrospectionTransformNode;
    readonly type: IntrospectionClassComponent;
};

type IntrospectionClassComponent = {
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
    ): IntrospectionClassInstance;
};

type IntrospectionClassUpdater = {
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

type IntrospectionClassInstance = React.Component<Readonly<Record<PropertyKey, unknown>>, unknown> & {
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
    readonly updater: IntrospectionClassUpdater;
};

type IntrospectionClassFrameState = {
    readonly boundaryErrorCause: unknown;
    readonly revision: number;
};

type IntrospectionStateUpdate = (props: Readonly<Record<PropertyKey, unknown>>, state: unknown) => unknown;

type IntrospectionStateUpdateFactory = (
    state: unknown,
    props: Readonly<Record<PropertyKey, unknown>>
) => unknown;

type IntrospectionClassLifecycle = {
    readonly previousProps: Readonly<Record<PropertyKey, unknown>>;
    readonly previousState: unknown;
    readonly shouldCommit: boolean;
};

const emptyErrorInfo = Object.freeze({ componentStack: '' });
const noCatchOnlyBoundaryRecovery = Symbol('noCatchOnlyBoundaryRecovery');
const catchOnlyBoundaryRecoveries = new WeakMap<IntrospectionClassComponent, Map<string, unknown>>();

export function isClassComponent(value: unknown): value is IntrospectionClassComponent {
    const prototype: unknown = typeof value === 'function' ? Reflect.get(value, 'prototype') : undefined;

    return isObjectOrFunction(prototype) && prototype.isReactComponent !== undefined;
}

function isErrorBoundary(type: IntrospectionClassComponent): boolean {
    return typeof type.getDerivedStateFromError === 'function' ||
        typeof type.prototype.componentDidCatch === 'function';
}

function createIntrospectionError(cause: unknown, handled: boolean): IntrospectionError {
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

    return isObjectOrFunction(left) && isObjectOrFunction(right) ? shallowEquals(left, right) : false;
}

function mergeState(state: unknown, partialState: unknown): unknown {
    if (partialState === null || partialState === undefined) {
        return state;
    }

    const baseState = isObjectOrFunction(state) ? state : {};

    return isObjectOrFunction(partialState)
        ? Object.freeze({
            ...baseState,
            ...partialState
        })
        : partialState;
}

function isStateUpdateFactory(value: unknown): value is IntrospectionStateUpdateFactory {
    return typeof value === 'function';
}

function toStateUpdate(partialState: unknown): IntrospectionStateUpdate {
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
    updates: readonly IntrospectionStateUpdate[]
): unknown {
    return updates.reduce(function applyUpdate(nextState, update) {
        return mergeState(nextState, update(props, nextState));
    }, state);
}

function readDerivedState(
    type: IntrospectionClassComponent,
    props: Readonly<Record<PropertyKey, unknown>>,
    state: unknown
): unknown {
    return typeof type.getDerivedStateFromProps === 'function'
        ? mergeState(state, type.getDerivedStateFromProps(props, state))
        : state;
}

function assignClassField(instance: IntrospectionClassInstance, property: PropertyKey, value: unknown): void {
    Reflect.set(instance, property, value);
}

function applyElementRef(ref: unknown, value: IntrospectionClassInstance | null): void {
    if (typeof ref === 'function') {
        Reflect.apply(ref, undefined, [ value ]);

        return;
    }

    if (isObjectOrFunction(ref)) {
        Reflect.set(ref, 'current', value);
    }
}

function executeIntrospectionClassRender(instance: IntrospectionClassInstance): React.ReactNode {
    try {
        return instance.render();
    } catch (error) {
        return throwIntrospectionRenderError(error);
    }
}

function notifyCatchBoundary(
    type: IntrospectionClassComponent,
    instance: IntrospectionClassInstance,
    error: unknown
): void {
    type.prototype.componentDidCatch?.call(instance, error, emptyErrorInfo);
}

function readCatchOnlyBoundaryRecoveries(type: IntrospectionClassComponent): Map<string, unknown> {
    let recoveries = catchOnlyBoundaryRecoveries.get(type);

    if (recoveries === undefined) {
        recoveries = new Map();
        catchOnlyBoundaryRecoveries.set(type, recoveries);
    }

    return recoveries;
}

function readCatchOnlyBoundaryRecovery(type: IntrospectionClassComponent, key: string): unknown {
    const recoveries = readCatchOnlyBoundaryRecoveries(type);

    return recoveries.has(key) ? recoveries.get(key) : noCatchOnlyBoundaryRecovery;
}

function writeCatchOnlyBoundaryRecovery(type: IntrospectionClassComponent, key: string, state: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).set(key, state);
}

function deleteCatchOnlyBoundaryRecovery(type: IntrospectionClassComponent, error: unknown): void {
    readCatchOnlyBoundaryRecoveries(type).delete(String(error));
}

const IntrospectionClassFrameBase = class
    extends React.Component<IntrospectionClassFrameProps, IntrospectionClassFrameState> {
    protected appliedBoundaryErrorCause: unknown;
    protected boundaryError: IntrospectionError | undefined;
    protected isApplyingBoundaryError = false;
    protected lifecycle: IntrospectionClassLifecycle | undefined;
    protected pendingStateUpdates: readonly IntrospectionStateUpdate[];
    protected renderedNode: IntrospectionTransformedNode;
    protected shouldForceRender: boolean;
    protected userInstance: IntrospectionClassInstance | undefined;

    public constructor(props: IntrospectionClassFrameProps) {
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
        _previousProps: IntrospectionClassFrameProps,
        _previousState: IntrospectionClassFrameState,
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
        _instance: IntrospectionClassInstance,
        _type: IntrospectionClassComponent,
        state: unknown
    ): unknown {
        Object.is(this.userInstance, undefined);

        return state;
    }

    protected clearQueuedUpdates(): void {
        this.pendingStateUpdates = Object.freeze([]);
        this.shouldForceRender = false;
    }

    protected createUpdater(): IntrospectionClassUpdater {
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
        instance: IntrospectionClassInstance,
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

    protected readNextState(
        instance: IntrospectionClassInstance,
        props: Readonly<Record<PropertyKey, unknown>>
    ): unknown {
        const updatedState = applyStateUpdates(props, instance.state, this.pendingStateUpdates);
        const boundaryState = this.readBoundaryState(instance, this.props.type, updatedState);

        return readDerivedState(this.props.type, props, boundaryState);
    }

    protected readRenderedNode(
        instance: IntrospectionClassInstance,
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): IntrospectionTransformedNode {
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
                executeIntrospectionClassRender(instance),
                nextDepth(this.props.depth, this.props.type),
                this.props.createFrameElement
            );
        }

        return this.renderedNode;
    }

    protected readUserInstance(): IntrospectionClassInstance {
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

const IntrospectionClassBoundaryFrame = class extends IntrospectionClassFrameBase {
    public static getDerivedStateFromError(error: unknown): IntrospectionClassFrameState {
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

        this.boundaryError = createIntrospectionError(error, true);
    }

    protected applyCatchOnlyBoundaryState(
        instance: IntrospectionClassInstance,
        type: IntrospectionClassComponent,
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

    protected createCatchOnlyBoundaryState(type: IntrospectionClassComponent, key: string, state: unknown): unknown {
        const nextState = applyStateUpdates(readElementProps(this.props.element), state, this.pendingStateUpdates);

        writeCatchOnlyBoundaryRecovery(type, key, nextState);

        return nextState;
    }

    protected override readBoundaryState(
        instance: IntrospectionClassInstance,
        type: IntrospectionClassComponent,
        state: unknown
    ): unknown {
        const { boundaryErrorCause } = this.state;

        if (boundaryErrorCause === undefined || this.appliedBoundaryErrorCause === boundaryErrorCause) {
            return state;
        }

        this.appliedBoundaryErrorCause = boundaryErrorCause;
        this.boundaryError = createIntrospectionError(boundaryErrorCause, true);

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
    type: IntrospectionClassComponent
): React.ComponentType<IntrospectionClassFrameProps> {
    return isErrorBoundary(type) ? IntrospectionClassBoundaryFrame : IntrospectionClassFrameBase;
}
