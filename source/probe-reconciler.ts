import * as timers from 'node:timers';
import React from 'react';
import createReconciler from 'react-reconciler';
import type { ProbeDiagnostics } from './probe-diagnostics.ts';
import { isProbeRenderError } from './probe-frame-contract.ts';
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
    type ProbeHostContainer,
    type ProbeHostInstance,
    type ProbeHostProps,
    type ProbeTextInstance,
    removeChild as removeHostChild,
    toSnapshot,
    unhideInstance,
    unhideTextInstance,
    validateContainerRefs
} from './probe-host-tree.ts';
import type { ProbeRefs } from './probe-public-types.ts';
import {
    createEmptyProbeSnapshot,
    type ProbeSnapshot
} from './probe-snapshot-contract.ts';

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: () => void;
};

type ProbeReconcilerRootOptions = {
    readonly diagnostics: ProbeDiagnostics;
    readonly element: React.ReactElement;
    readonly idGenerator: ((generatedId: string) => string) | undefined;
    readonly idPrefix: string;
    readonly publish: (snapshot: ProbeSnapshot) => void;
    readonly refs: ProbeRefs | undefined;
    readonly strictMode: boolean;
    readonly waitTimeout: number;
};

export type ProbeReconcilerRoot = {
    readonly act: (action: () => unknown) => unknown;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};

const defaultEventPriority = 32;
const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

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

function publishContainerSnapshot(container: ProbeHostContainer): void {
    container.publish(toSnapshot(container));
}

function prepareForCommit(): null {
    return null;
}

const probeReconcilerHostConfig = {
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
    cancelTimeout: timers.clearTimeout,
    cancelRootViewTransitionName: noop,
    cancelViewTransitionName: noop,
    clearActivityBoundary: noop,
    clearActivityBoundaryFromContainer: noop,
    clearContainer,
    clearSuspenseBoundary: noop,
    commitMount: noop,
    commitTextUpdate(instance: ProbeTextInstance, _oldText: string, newText: string) {
        instance.writeText(newText);
    },
    commitUpdate(
        instance: ProbeHostInstance,
        _type: string,
        _oldProps: ProbeHostProps,
        newProps: ProbeHostProps
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
    getPublicInstance(instance: ProbeHostInstance) {
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
    resolveEventTimeStamp: Date.now,
    resolveEventType: returnNull,
    resolveUpdatePriority: getDefaultEventPriority,
    restoreRootViewTransitionName: noop,
    restoreViewTransitionName: noop,
    scheduleMicrotask: queueMicrotask,
    scheduleTimeout: timers.setTimeout,
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

const renderer = createReconciler(probeReconcilerHostConfig);

function createReconcilerContainer(
    container: ProbeHostContainer,
    diagnostics: ProbeDiagnostics,
    strictMode: boolean
): Record<string, unknown> {
    return renderer.createContainer(
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

function actNow(action: () => unknown): unknown {
    const results = new Set<unknown>();
    const hadActEnvironment = Object.hasOwn(globalThis, reactActEnvironmentKey);
    const previousActEnvironment: unknown = Reflect.get(globalThis, reactActEnvironmentKey);

    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

    try {
        React.act(function runAction() {
            results.add(action());
        });
    } finally {
        if (hadActEnvironment) {
            Reflect.set(globalThis, reactActEnvironmentKey, previousActEnvironment);
        } else {
            Reflect.deleteProperty(globalThis, reactActEnvironmentKey);
        }
    }

    return results.values().next().value;
}

type ProbeReconcilerState = {
    readonly readRenderCount: () => number;
    readonly readWaiters: () => readonly Waiter[];
    readonly writeRenderCount: (count: number) => void;
    readonly writeWaiters: (waiters: readonly Waiter[]) => void;
};

type ProbeReconcilerSession = {
    readonly container: ProbeHostContainer;
    readonly options: ProbeReconcilerRootOptions;
    readonly root: Readonly<Record<string, unknown>>;
    readonly state: ProbeReconcilerState;
};

function settleWaiters(sessionState: ProbeReconcilerState): void {
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
    options: ProbeReconcilerRootOptions,
    state: ProbeReconcilerState
): ProbeHostContainer {
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

function createProbeReconcilerSession(options: ProbeReconcilerRootOptions): ProbeReconcilerSession {
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
    const root = createReconcilerContainer(container, options.diagnostics, options.strictMode);

    return Object.freeze({
        container,
        options,
        root,
        state
    });
}

function actSession(session: ProbeReconcilerSession, action: () => unknown): unknown {
    return session.options.diagnostics.run(function actWithDiagnostics() {
        return actNow(function runAction() {
            const result = action();

            renderer.flushSyncWork();
            renderer.flushPassiveEffects();

            return result;
        });
    });
}

async function waitForIdleSession(session: ProbeReconcilerSession): Promise<void> {
    await session.options.diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
        await Promise.resolve();
        renderer.flushPassiveEffects();
        settleWaiters(session.state);
    });
}

async function waitForSession(session: ProbeReconcilerSession, predicate: () => boolean): Promise<void> {
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

function publishEmptySnapshot(session: ProbeReconcilerSession, renderCountBefore: number): void {
    const errorRenderCount = Math.max(session.state.readRenderCount(), renderCountBefore + 1);

    session.options.publish(createEmptyProbeSnapshot(errorRenderCount));
}

function publishEmptyErrorSnapshot(session: ProbeReconcilerSession, renderCountBefore: number): void {
    session.container.writeMounted(false);
    session.container.writeChildren([]);
    publishEmptySnapshot(session, renderCountBefore);
}

function captureRenderError(
    session: ProbeReconcilerSession,
    error: unknown,
    renderCountBefore: number
): void {
    if (!isProbeRenderError(error)) {
        throw error;
    }

    publishEmptyErrorSnapshot(session, renderCountBefore);
    session.options.diagnostics.recordUncaughtError(error);
}

function captureMissingInitialCommit(session: ProbeReconcilerSession, renderCountBefore: number): void {
    if (
        renderCountBefore > 0 ||
        session.state.readRenderCount() > renderCountBefore ||
        session.options.diagnostics.errors.length > 0
    ) {
        return;
    }

    const message = 'React Probe cannot commit a suspended root. ' +
        'Wrap lazy, async, or promise-using roots in React.Suspense.';

    publishEmptyErrorSnapshot(session, renderCountBefore);
    session.options.diagnostics.recordUncaughtError(new Error(message));
}

function updateRootElement(
    session: ProbeReconcilerSession,
    element: Readonly<React.ReactElement> | null
): void {
    renderer.flushSyncFromReconciler(function updateContainer() {
        renderer.updateContainer(element, session.root, null, null);
    });
}

function renderRootElement(
    session: ProbeReconcilerSession,
    element: Readonly<React.ReactElement> | null
): void {
    actNow(function renderElement() {
        updateRootElement(session, element);
        renderer.flushPassiveEffects();
    });
}

function renderWithDiagnostics(
    session: ProbeReconcilerSession,
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

function flushElement(session: ProbeReconcilerSession, element: Readonly<React.ReactElement> | null): void {
    session.options.diagnostics.run(function renderElementWithDiagnostics() {
        renderWithDiagnostics(session, element);
    });
}

async function waitForNextRenderSession(session: ProbeReconcilerSession): Promise<void> {
    const expectedRenderCount = session.state.readRenderCount() + 1;

    return waitForSession(session, function didRender() {
        return session.state.readRenderCount() >= expectedRenderCount;
    });
}

async function waitForRenderCountSession(session: ProbeReconcilerSession, count: number): Promise<void> {
    return waitForSession(session, function didRenderCount() {
        return session.state.readRenderCount() >= count;
    });
}

export function createProbeReconcilerRoot(options: ProbeReconcilerRootOptions): ProbeReconcilerRoot {
    const session = createProbeReconcilerSession(options);

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
