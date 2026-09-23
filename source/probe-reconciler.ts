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
    insertBefore,
    type ProbeHostContainer,
    type ProbeHostInstance,
    type ProbeHostProps,
    type ProbeTextInstance,
    removeChild as removeHostChild,
    toSnapshot,
    validateContainerRefs
} from './probe-host-tree.ts';
import type { ProbeRefs } from './probe-public-types.ts';
import { createEmptyProbeSnapshot, type ProbeSnapshot } from './probe-snapshot.ts';

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: () => void;
};

type ProbeReconcilerRootOptions = {
    readonly diagnostics: ProbeDiagnostics;
    readonly element: React.ReactElement;
    readonly publish: (snapshot: ProbeSnapshot) => void;
    readonly refs: ProbeRefs | undefined;
    readonly strictMode: boolean;
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
        '',
        diagnostics.recordUncaughtError,
        diagnostics.recordCaughtError,
        diagnostics.recordRecoverableError,
        null
    );
}

function actNow(action: () => unknown): unknown {
    const results = new Set<unknown>();

    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

    React.act(function runAction() {
        results.add(action());
    });

    return results.values().next().value;
}

type ProbeReconcilerState = {
    readonly readNextRenderWaitStart: () => number;
    readonly readRenderCount: () => number;
    readonly readWaiters: () => readonly Waiter[];
    readonly writeNextRenderWaitStart: (count: number) => void;
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
        options.refs
    );
}

function createProbeReconcilerSession(options: ProbeReconcilerRootOptions): ProbeReconcilerSession {
    let nextRenderWaitStart = 0;
    let renderCount = 0;
    let waiters: readonly Waiter[] = [];
    const state = Object.freeze({
        readNextRenderWaitStart() {
            return nextRenderWaitStart;
        },
        readRenderCount() {
            return renderCount;
        },
        readWaiters() {
            return waiters;
        },
        writeNextRenderWaitStart(count: number) {
            nextRenderWaitStart = count;
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

async function waitForSession(session: ProbeReconcilerSession, predicate: () => boolean): Promise<void> {
    if (session.options.diagnostics.run(predicate)) {
        return;
    }

    return new Promise<void>(function createWait(resolve) {
        const waiter: Waiter = {
            predicate,
            resolve
        };

        session.state.writeWaiters([
            ...session.state.readWaiters(),
            waiter
        ]);
    });
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
}

function flushElement(session: ProbeReconcilerSession, element: Readonly<React.ReactElement> | null): void {
    session.options.diagnostics.run(function renderElementWithDiagnostics() {
        renderWithDiagnostics(session, element);
    });
}

async function waitForIdleSession(session: ProbeReconcilerSession): Promise<void> {
    await session.options.diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
        await Promise.resolve();
        renderer.flushPassiveEffects();
    });
}

async function waitForNextRenderSession(session: ProbeReconcilerSession): Promise<void> {
    const expectedRenderCount = session.state.readNextRenderWaitStart() + 1;

    session.state.writeNextRenderWaitStart(Math.max(
        session.state.readNextRenderWaitStart(),
        expectedRenderCount
    ));

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
