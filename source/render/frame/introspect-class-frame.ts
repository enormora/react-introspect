import React from 'react';
import { createDiagnosticRecord } from '../../diagnostics/introspect-diagnostics.ts';
import type {
    IntrospectionClassComponent,
    IntrospectionClassInstance,
    IntrospectionClassUpdater
} from '../../values/introspect-class-component.ts';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost
} from '../protocol/introspect-host-protocol.ts';
import {
    type IntrospectionElement,
    type IntrospectionRenderChildren,
    type IntrospectionTransformedNode,
    readElementRef
} from './introspect-frame-contract.ts';
import { throwIntrospectionRenderError } from './introspect-render-error.ts';
import { type IntrospectionFrameDepth, nextDepth } from './introspect-frame-depth.ts';

export type IntrospectionClassFrameProps = {
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
    readonly renderChildren: IntrospectionRenderChildren;
    readonly type: IntrospectionClassComponent;
};

type IntrospectionUnfoldedError = {
    readonly cause: unknown;
    readonly phase: 'unfolded';
};

type IntrospectionFoldedError = {
    readonly cause: unknown;
    readonly phase: 'awaitingRecovery' | 'recovered';
    readonly isCapturing: boolean;
};

type IntrospectionCaughtError = IntrospectionFoldedError | IntrospectionUnfoldedError;

type IntrospectionClassFrameState = {
    readonly caught: IntrospectionCaughtError | undefined;
    readonly userState: unknown;
};

type IntrospectionStateUpdate = (props: Readonly<Record<PropertyKey, unknown>>, state: unknown) => unknown;

type IntrospectionStateUpdateFactory = (
    state: unknown,
    props: Readonly<Record<PropertyKey, unknown>>
) => unknown;

type IntrospectionClassRender = {
    readonly node: IntrospectionTransformedNode;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly state: unknown;
};

type IntrospectionClassRenderPass = {
    readonly next: IntrospectionClassRender;
    readonly previous: IntrospectionClassRender | undefined;
    readonly shouldUpdate: boolean;
};

function isErrorBoundary(type: IntrospectionClassComponent): boolean {
    return typeof type.getDerivedStateFromError === 'function' ||
        typeof type.prototype.componentDidCatch === 'function';
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

function readDerivedState(
    type: IntrospectionClassComponent,
    props: Readonly<Record<PropertyKey, unknown>>,
    state: unknown
): unknown {
    return typeof type.getDerivedStateFromProps === 'function'
        ? mergeState(state, type.getDerivedStateFromProps(props, state))
        : state;
}

function recoverCaughtError(caught: IntrospectionCaughtError | undefined): IntrospectionCaughtError | undefined {
    return caught?.phase === 'awaitingRecovery'
        ? { cause: caught.cause, isCapturing: false, phase: 'recovered' }
        : caught;
}

function settleCapture(
    state: IntrospectionClassFrameState,
    caught: IntrospectionFoldedError | undefined
): IntrospectionClassFrameState {
    return caught?.isCapturing === true ? { ...state, caught: { ...caught, isCapturing: false } } : state;
}

function isCapturing(caught: IntrospectionCaughtError | undefined): boolean {
    return caught?.phase !== 'unfolded' && caught?.isCapturing === true;
}

function foldBoundaryError(
    type: IntrospectionClassComponent,
    state: IntrospectionClassFrameState
): IntrospectionClassFrameState {
    const { caught } = state;

    if (caught?.phase !== 'unfolded') {
        return settleCapture(state, caught);
    }

    if (typeof type.getDerivedStateFromError === 'function') {
        return {
            ...state,
            caught: { cause: caught.cause, isCapturing: true, phase: 'recovered' },
            userState: mergeState(state.userState, type.getDerivedStateFromError(caught.cause))
        };
    }

    return {
        ...state,
        caught: { cause: caught.cause, isCapturing: true, phase: 'awaitingRecovery' }
    };
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

const IntrospectionClassFrameBase = class
    extends React.Component<IntrospectionClassFrameProps, IntrospectionClassFrameState> {
    protected committedRender: IntrospectionClassRender | undefined;
    protected renderPass: IntrospectionClassRenderPass | undefined;
    protected shouldForceRender: boolean;
    protected readonly userInstance: IntrospectionClassInstance;

    public constructor(props: IntrospectionClassFrameProps) {
        super(props);

        const ClassComponent = props.type;
        const instance = new ClassComponent(props.element.props, undefined);

        assignClassField(instance, 'updater', this.createUpdater());
        assignClassField(instance, 'refs', {});
        this.committedRender = undefined;
        this.renderPass = undefined;
        this.shouldForceRender = false;
        this.state = {
            caught: undefined,
            userState: instance.state
        };
        this.userInstance = instance;
    }

    public static getDerivedStateFromProps(
        props: IntrospectionClassFrameProps,
        state: IntrospectionClassFrameState
    ): IntrospectionClassFrameState {
        const foldedState = foldBoundaryError(props.type, state);

        return {
            ...foldedState,
            userState: readDerivedState(props.type, props.element.props, foldedState.userState)
        };
    }

    public override render(): React.ReactElement {
        const { caught } = this.state;
        const renderPass = this.createRenderPass(this.props.element.props, this.state.userState);

        this.renderPass = renderPass;

        return createComponentHost(
            createComponentMetadata({
                activityMode: undefined,
                caughtError: caught === undefined ? undefined : createDiagnosticRecord(caught.cause),
                element: this.props.element,
                renderedReason: undefined
            }),
            renderPass.next.node
        );
    }

    public override componentDidMount(): void {
        this.commitRenderPass();
        applyElementRef(readElementRef(this.props.element), this.userInstance);
        this.userInstance.componentDidMount?.();
    }

    public override componentDidUpdate(
        _previousProps: IntrospectionClassFrameProps,
        _previousState: IntrospectionClassFrameState,
        snapshot: unknown
    ): void {
        const { renderPass } = this;

        this.commitRenderPass();
        applyElementRef(readElementRef(this.props.element), this.userInstance);

        if (renderPass?.shouldUpdate === true && renderPass.previous !== undefined) {
            this.userInstance.componentDidUpdate?.(renderPass.previous.props, renderPass.previous.state, snapshot);
        }
    }

    public override getSnapshotBeforeUpdate(): unknown {
        const { renderPass } = this;

        if (renderPass?.shouldUpdate !== true || renderPass.previous === undefined) {
            return null;
        }

        return this.userInstance.getSnapshotBeforeUpdate?.(renderPass.previous.props, renderPass.previous.state) ??
            null;
    }

    public override componentWillUnmount(): void {
        this.userInstance.componentWillUnmount?.();
        applyElementRef(readElementRef(this.props.element), null);
    }

    protected commitRenderPass(): void {
        this.committedRender = this.renderPass?.next;
        this.shouldForceRender = false;
    }

    protected createUpdater(): IntrospectionClassUpdater {
        return {
            enqueueForceUpdate: (_instance: unknown, callback: (() => void) | undefined) => {
                this.shouldForceRender = true;
                this.setState(function recoverFromCatch(state) {
                    return { caught: recoverCaughtError(state.caught) };
                }, callback);
            },
            enqueueSetState: (_instance: unknown, partialState: unknown, callback: (() => void) | undefined) => {
                const update = toStateUpdate(partialState);

                this.setState(function applyUserStateUpdate(state, props) {
                    return {
                        caught: recoverCaughtError(state.caught),
                        userState: mergeState(state.userState, update(props.element.props, state.userState))
                    };
                }, callback);
            }
        };
    }

    protected createRenderPass(
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): IntrospectionClassRenderPass {
        const previous = this.committedRender;

        if (previous !== undefined) {
            assignClassField(this.userInstance, 'props', previous.props);
            assignClassField(this.userInstance, 'state', previous.state);
        }

        const shouldUpdate = previous === undefined || this.shouldRender(previous, props, state);

        assignClassField(this.userInstance, 'props', props);
        assignClassField(this.userInstance, 'state', state);

        return {
            next: {
                node: shouldUpdate || isCapturing(this.state.caught) ? this.renderUserOutput() : previous.node,
                props,
                state
            },
            previous,
            shouldUpdate
        };
    }

    protected renderUserOutput(): IntrospectionTransformedNode {
        if (this.state.caught?.phase === 'awaitingRecovery') {
            return createEmptyHost(undefined);
        }

        return this.props.renderChildren(
            executeIntrospectionClassRender(this.userInstance),
            nextDepth(this.props.depth, this.props.type)
        );
    }

    protected shouldRender(
        previous: IntrospectionClassRender,
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ): boolean {
        const instance = this.userInstance;

        if (this.shouldForceRender) {
            return true;
        }

        if (typeof instance.shouldComponentUpdate === 'function') {
            return instance.shouldComponentUpdate(props, state, instance.context);
        }

        if (instance.isPureReactComponent === true) {
            return !shallowEquals(previous.props, props) || !shallowStateEquals(previous.state, state);
        }

        return true;
    }
};

const IntrospectionClassBoundaryFrame = class extends IntrospectionClassFrameBase {
    public static getDerivedStateFromError(error: unknown): Partial<IntrospectionClassFrameState> {
        return {
            caught: { cause: error, phase: 'unfolded' }
        };
    }

    public override componentDidCatch(error: unknown, errorInfo: unknown): void {
        this.userInstance.componentDidCatch?.(error, errorInfo);
    }
};

export function readClassFrameType(
    type: IntrospectionClassComponent
): React.ComponentType<IntrospectionClassFrameProps> {
    return isErrorBoundary(type) ? IntrospectionClassBoundaryFrame : IntrospectionClassFrameBase;
}
