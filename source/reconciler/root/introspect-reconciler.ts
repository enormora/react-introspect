import type React from 'react';
import createReconciler, { type ReconcilerInstance, type ReconcilerRoot } from 'react-reconciler';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { isIntrospectionRenderError } from '../../render/frame/introspect-frame-contract.ts';
import {
    appendChild,
    clearContainer,
    createHostContainer,
    createHostInstance,
    createTextInstance,
    getChildHostContext,
    getRootHostContext,
    hideInstance,
    hideTextInstance,
    insertBefore,
    type IntrospectionHostContainer,
    type IntrospectionHostInstance,
    type IntrospectionHostProps,
    type IntrospectionTextInstance,
    removeChild as removeHostChild,
    toSnapshot,
    unhideInstance,
    unhideTextInstance,
    validateContainerRefs
} from '../host/introspect-host-tree.ts';
import type { IntrospectionRefs } from '../../public/introspect-public-types.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import type { IntrospectionRuntimeDependencies } from '../../runtime/view/introspect-runtime-dependencies-types.ts';
import { isObject } from '../../values/introspect-value-kinds.ts';
import {
    createIntrospectionReconcilerRuntime,
    type IntrospectionReconcilerRuntime
} from './introspect-reconciler-runtime.ts';

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: () => void;
};

type IntrospectionReconcilerRootOptions = {
    readonly diagnostics: IntrospectionDiagnostics;
    readonly element: React.ReactElement;
    readonly idGenerator: ((generatedId: string) => string) | undefined;
    readonly idPrefix: string;
    readonly publish: (snapshot: IntrospectionSnapshot) => void;
    readonly refs: IntrospectionRefs | undefined;
    readonly strictMode: boolean;
    readonly waitTimeout: number;
};

type IntrospectionReconcilerRoot = {
    readonly act: (action: () => unknown) => unknown;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};

export type IntrospectionReconcilerModule = {
    readonly createRoot: (options: IntrospectionReconcilerRootOptions) => IntrospectionReconcilerRoot;
};

export type IntrospectionReconcilerModuleDependencies = {
    readonly runtime: IntrospectionRuntimeDependencies;
};

const defaultEventPriority = 32;

function noop(): void {
    return undefined;
}

function alwaysFalse(): boolean {
    return false;
}

function returnNull(): null {
    return null;
}

function getDefaultEventPriority(): number {
    return defaultEventPriority;
}

function publishContainerSnapshot(container: IntrospectionHostContainer): void {
    container.publish(toSnapshot(container));
}

function prepareForCommit(): null {
    return null;
}

function createIntrospectionReconcilerHostConfig(reconcilerRuntime: IntrospectionReconcilerRuntime): unknown {
    return {
        NotPendingTransition: null,
        HostTransitionContext: {
            _currentValue: null,
            _currentValue2: null
        },
        appendChild,
        appendChildToContainer: appendChild,
        appendInitialChild: appendChild,
        applyViewTransitionName: noop,
        beforeActiveInstanceBlur: noop,
        cancelTimeout: reconcilerRuntime.cancelTimeout,
        cancelRootViewTransitionName: noop,
        cancelViewTransitionName: noop,
        clearActivityBoundary: noop,
        clearActivityBoundaryFromContainer: noop,
        clearContainer,
        clearSuspenseBoundary: noop,
        commitMount: noop,
        commitTextUpdate(instance: IntrospectionTextInstance, _oldText: string, newText: string) {
            instance.writeText(newText);
        },
        commitUpdate(
            instance: IntrospectionHostInstance,
            _type: string,
            _oldProps: IntrospectionHostProps,
            newProps: IntrospectionHostProps
        ) {
            instance.writeProps(newProps);
            instance.refreshPublicInstance(newProps);
        },
        createInstance: createHostInstance,
        createTextInstance,
        detachDeletedInstance: noop,
        finalizeInitialChildren: alwaysFalse,
        getChildHostContext,
        getCurrentUpdatePriority: getDefaultEventPriority,
        getPublicInstance(instance: IntrospectionHostInstance) {
            return instance.readPublicInstance();
        },
        getRootHostContext,
        hideInstance,
        hideTextInstance,
        insertBefore,
        insertInContainerBefore: insertBefore,
        isPrimaryRenderer: false,
        isSuspenseInstanceFallback: alwaysFalse,
        isSuspenseInstancePending: alwaysFalse,
        maySuspendCommit: alwaysFalse,
        maySuspendCommitInSyncRender: alwaysFalse,
        maySuspendCommitOnUpdate: alwaysFalse,
        noTimeout: -1,
        prepareForCommit,
        preparePortalMount: noop,
        removeChild: removeHostChild.bind(undefined),
        removeChildFromContainer: removeHostChild.bind(undefined),
        resetAfterCommit: publishContainerSnapshot,
        resetFormInstance: noop,
        resolveEventTimeStamp: reconcilerRuntime.readEventTimestamp,
        resolveEventType: returnNull,
        resolveUpdatePriority: getDefaultEventPriority,
        restoreRootViewTransitionName: noop,
        restoreViewTransitionName: noop,
        scheduleMicrotask: reconcilerRuntime.scheduleMicrotask,
        scheduleTimeout: reconcilerRuntime.scheduleTimeout,
        setCurrentUpdatePriority: noop,
        shouldAttemptEagerTransition: alwaysFalse,
        shouldSetTextContent: alwaysFalse,
        startSuspendingCommit: noop,
        stopViewTransition: noop,
        supportsHydration: false,
        supportsMicrotasks: true,
        supportsMutation: true,
        supportsPersistence: false,
        supportsTestSelectors: false,
        suspendInstance: noop,
        suspendOnActiveViewTransition: alwaysFalse,
        trackSchedulerEvent: noop,
        unhideInstance,
        unhideTextInstance,
        waitForCommitToBeReady: returnNull
    };
}

type IntrospectionReconcilerModuleState = {
    readonly reconcilerRuntime: IntrospectionReconcilerRuntime;
    readonly runtime: IntrospectionRuntimeDependencies;
};

const reconcilerRuntime = createIntrospectionReconcilerRuntime();
const renderer = createReconciler(createIntrospectionReconcilerHostConfig(reconcilerRuntime));

function createReconcilerContainer(
    rendererInstance: ReconcilerInstance,
    container: IntrospectionHostContainer,
    diagnostics: IntrospectionDiagnostics,
    strictMode: boolean
): ReconcilerRoot {
    return rendererInstance.createContainer(
        container,
        1,
        null,
        strictMode,
        null,
        container.readIdNormalization().prefix,
        diagnostics.recordUncaughtError,
        diagnostics.recordCaughtError,
        diagnostics.recordRecoverableError,
        null
    );
}

type IntrospectionReconcilerState = {
    readonly readRenderCount: () => number;
    readonly readWaiters: () => readonly Waiter[];
    readonly writeRenderCount: (count: number) => void;
    readonly writeWaiters: (waiters: readonly Waiter[]) => void;
};

type IntrospectionReconcilerSession = {
    readonly container: IntrospectionHostContainer;
    readonly moduleState: IntrospectionReconcilerModuleState;
    readonly options: IntrospectionReconcilerRootOptions;
    readonly root: Readonly<Record<string, unknown>>;
    readonly state: IntrospectionReconcilerState;
};

function settleWaiters(sessionState: IntrospectionReconcilerState): void {
    const settledWaiters = sessionState.readWaiters().filter(function isSettled(waiter) {
        return waiter.predicate();
    });

    for (const waiter of settledWaiters) {
        sessionState.writeWaiters(
            sessionState.readWaiters().toSpliced(
                sessionState.readWaiters().indexOf(waiter),
                1
            )
        );
        waiter.resolve();
    }
}

function createSessionContainer(
    options: IntrospectionReconcilerRootOptions,
    state: IntrospectionReconcilerState
): IntrospectionHostContainer {
    return createHostContainer(
        function publishSnapshot(snapshot) {
            state.writeRenderCount(snapshot.renderCount);
            options.publish(snapshot);
            settleWaiters(state);
        },
        function readNextRenderCount() {
            return state.readRenderCount() + 1;
        },
        {
            generator: options.idGenerator,
            prefix: options.idPrefix
        },
        options.refs
    );
}

function createIntrospectionReconcilerSession(
    moduleState: IntrospectionReconcilerModuleState,
    options: IntrospectionReconcilerRootOptions
): IntrospectionReconcilerSession {
    let renderCount = 0;
    let waiters: readonly Waiter[] = [];
    const state = Object.freeze({
        readRenderCount() {
            return renderCount;
        },
        readWaiters() {
            return waiters;
        },
        writeRenderCount(count: number) {
            renderCount = count;
        },
        writeWaiters(nextWaiters: readonly Waiter[]) {
            waiters = nextWaiters;
        }
    });
    const container = createSessionContainer(options, state);
    moduleState.reconcilerRuntime.enter(moduleState.runtime);
    const root = moduleState.reconcilerRuntime.run(moduleState.runtime, function createContainerWithRuntime() {
        return createReconcilerContainer(renderer, container, options.diagnostics, options.strictMode);
    });

    return Object.freeze({
        container,
        moduleState,
        options,
        root,
        state
    });
}

function actSession(session: IntrospectionReconcilerSession, action: () => unknown): unknown {
    return session.options.diagnostics.run(function actWithDiagnostics() {
        return session.moduleState.reconcilerRuntime.run(session.moduleState.runtime, function actWithRuntime() {
            return session.moduleState.runtime.actEnvironment.act(function runAction() {
                const result = action();

                renderer.flushSyncWork();
                renderer.flushPassiveEffects();

                return result;
            });
        });
    });
}

function hasScheduledRootTask(session: IntrospectionReconcilerSession): boolean {
    const task = session.root.callbackNode;

    return isObject(task) && typeof task.callback === 'function';
}

async function flushMicrotasks(session: IntrospectionReconcilerSession): Promise<void> {
    await session.moduleState.reconcilerRuntime.run(
        session.moduleState.runtime,
        async function flushMicrotasksWithRuntime() {
            await session.moduleState.runtime.microtasks.flush();
        }
    );
}

async function flushScheduledWork(session: IntrospectionReconcilerSession): Promise<void> {
    await flushMicrotasks(session);

    do {
        await session.moduleState.runtime.macrotasks.waitForNext();
        await flushMicrotasks(session);
    } while (hasScheduledRootTask(session));
}

async function waitForIdleSession(session: IntrospectionReconcilerSession): Promise<void> {
    await session.options.diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
        await flushScheduledWork(session);
        session.moduleState.reconcilerRuntime.run(session.moduleState.runtime, function flushWithRuntime() {
            renderer.flushPassiveEffects();
            settleWaiters(session.state);
        });
    });
}

async function waitForSession(session: IntrospectionReconcilerSession, predicate: () => boolean): Promise<void> {
    if (session.options.diagnostics.run(predicate)) {
        return;
    }

    const waiting = new Promise<void>(function createWait(resolve) {
        const waiter: Waiter = {
            predicate,
            resolve() {
                resolve();
            }
        };

        session.state.writeWaiters([
            ...session.state.readWaiters(),
            waiter
        ]);
    });

    await waitForIdleSession(session);

    if (!session.options.diagnostics.run(predicate)) {
        await waiting;
    }
}

function publishEmptySnapshot(session: IntrospectionReconcilerSession, renderCountBefore: number): void {
    const errorRenderCount = Math.max(session.state.readRenderCount(), renderCountBefore + 1);

    session.options.publish(createEmptyIntrospectionSnapshot(errorRenderCount));
}

function publishEmptyErrorSnapshot(session: IntrospectionReconcilerSession, renderCountBefore: number): void {
    session.container.writeMounted(false);
    session.container.writeChildren([]);
    publishEmptySnapshot(session, renderCountBefore);
}

function captureRenderError(
    session: IntrospectionReconcilerSession,
    error: unknown,
    renderCountBefore: number
): void {
    if (!isIntrospectionRenderError(error)) {
        throw error;
    }

    publishEmptyErrorSnapshot(session, renderCountBefore);
    session.options.diagnostics.recordUncaughtError(error);
}

function captureMissingInitialCommit(session: IntrospectionReconcilerSession, renderCountBefore: number): void {
    if (
        renderCountBefore > 0 ||
        session.state.readRenderCount() > renderCountBefore ||
        session.options.diagnostics.errors.length > 0
    ) {
        return;
    }

    const message = 'React Introspect cannot commit a suspended root. ' +
        'Wrap lazy, async, or promise-using roots in React.Suspense.';

    publishEmptyErrorSnapshot(session, renderCountBefore);
    session.options.diagnostics.recordUncaughtError(new Error(message));
}

function updateRootElement(
    session: IntrospectionReconcilerSession,
    element: Readonly<React.ReactElement> | null
): void {
    renderer.flushSyncFromReconciler(function updateContainer() {
        renderer.updateContainer(element, session.root, null, null);
    });
}

function renderRootElement(
    session: IntrospectionReconcilerSession,
    element: Readonly<React.ReactElement> | null
): void {
    session.moduleState.reconcilerRuntime.run(session.moduleState.runtime, function renderWithRuntime() {
        session.moduleState.runtime.actEnvironment.act(function renderElement() {
            updateRootElement(session, element);
            renderer.flushSyncWork();
            renderer.flushPassiveEffects();
        });
    });
}

function renderWithDiagnostics(
    session: IntrospectionReconcilerSession,
    element: Readonly<React.ReactElement> | null
): void {
    const renderCountBefore = session.state.readRenderCount();

    session.container.writeMounted(element !== null);

    try {
        renderRootElement(session, element);
    } catch (error) {
        captureRenderError(session, error, renderCountBefore);

        return;
    }

    validateContainerRefs(session.container);
    captureMissingInitialCommit(session, renderCountBefore);
}

function flushElement(session: IntrospectionReconcilerSession, element: Readonly<React.ReactElement> | null): void {
    session.options.diagnostics.run(function renderElementWithDiagnostics() {
        renderWithDiagnostics(session, element);
    });
}

async function waitForNextRenderSession(session: IntrospectionReconcilerSession): Promise<void> {
    const expectedRenderCount = session.state.readRenderCount() + 1;

    return waitForSession(session, function didRender() {
        return session.state.readRenderCount() >= expectedRenderCount;
    });
}

async function waitForRenderCountSession(session: IntrospectionReconcilerSession, count: number): Promise<void> {
    return waitForSession(session, function didRenderCount() {
        return session.state.readRenderCount() >= count;
    });
}

function createIntrospectionReconcilerRoot(
    moduleState: IntrospectionReconcilerModuleState,
    options: IntrospectionReconcilerRootOptions
): IntrospectionReconcilerRoot {
    const session = createIntrospectionReconcilerSession(moduleState, options);

    flushElement(session, options.element);

    return Object.freeze({
        act(action: () => unknown) {
            return actSession(session, action);
        },
        unmount() {
            flushElement(session, null);
        },
        update(element: React.ReactElement) {
            flushElement(session, element);
        },
        async waitForIdle() {
            await waitForIdleSession(session);
        },
        async waitForNextRender() {
            return waitForNextRenderSession(session);
        },
        async waitForRenderCount(count: number) {
            return waitForRenderCountSession(session, count);
        },
        async waitUntil(predicate: () => boolean) {
            return waitForSession(session, predicate);
        }
    });
}

export function createIntrospectionReconcilerModule(
    dependencies: IntrospectionReconcilerModuleDependencies
): IntrospectionReconcilerModule {
    const moduleState = Object.freeze({
        reconcilerRuntime,
        runtime: dependencies.runtime
    });

    return Object.freeze({
        createRoot(options) {
            return createIntrospectionReconcilerRoot(moduleState, options);
        }
    });
}
