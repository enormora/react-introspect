import * as timers from 'node:timers';
import React from 'react';
import createReconciler from 'react-reconciler';
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
    removeChild,
    toSnapshot,
    validateContainerRefs
} from './probe-host-tree.ts';
import type { ProbeRefs } from './probe-public-types.ts';
import type { ProbeSnapshot } from './probe-snapshot.ts';

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: () => void;
};

type ProbeReconcilerRootOptions = {
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

const renderer = createReconciler({
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
    prepareForCommit: returnNull,
    preparePortalMount: noop,
    removeChild,
    removeChildFromContainer: removeChild,
    resetAfterCommit(container: ProbeHostContainer) {
        container.publish(toSnapshot(container));
    },
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
});

function createReconcilerContainer(container: ProbeHostContainer, strictMode: boolean): Record<string, unknown> {
    return renderer.createContainer(
        container,
        1,
        null,
        strictMode,
        null,
        '',
        noop,
        noop,
        noop,
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

export function createProbeReconcilerRoot(options: ProbeReconcilerRootOptions): ProbeReconcilerRoot {
    let renderCount = 0;
    let nextRenderWaitStart = 0;
    const waiters: Waiter[] = [];

    function settleWaiters(): void {
        const settledWaiters = waiters.slice().filter(function isSettled(waiter) {
            return waiter.predicate();
        });

        for (const waiter of settledWaiters) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve();
        }
    }

    const container = createHostContainer(
        function publishSnapshot(snapshot) {
            renderCount = snapshot.renderCount;
            options.publish(snapshot);
            settleWaiters();
        },
        function readNextRenderCount() {
            return renderCount + 1;
        },
        options.refs
    );

    const root = createReconcilerContainer(container, options.strictMode);

    async function waitFor(predicate: () => boolean): Promise<void> {
        if (predicate()) {
            return;
        }

        return new Promise(function createWait(resolve) {
            const waiter: Waiter = {
                predicate,
                resolve
            };

            waiters.push(waiter);
        });
    }

    function flushElement(element: Readonly<React.ReactElement> | null): void {
        container.writeMounted(element !== null);

        actNow(function renderElement() {
            renderer.flushSyncFromReconciler(function updateContainer() {
                renderer.updateContainer(element, root, null, null);
            });
            renderer.flushPassiveEffects();
        });
        validateContainerRefs(container);
    }

    flushElement(options.element);

    return Object.freeze({
        act(action: () => unknown) {
            return actNow(function runAction() {
                const result = action();

                renderer.flushSyncWork();
                renderer.flushPassiveEffects();

                return result;
            });
        },
        unmount() {
            flushElement(null);
        },
        update(element: React.ReactElement) {
            flushElement(element);
        },
        async waitForIdle() {
            await Promise.resolve();
            renderer.flushPassiveEffects();
        },
        async waitForNextRender() {
            const expectedRenderCount = nextRenderWaitStart + 1;

            nextRenderWaitStart = Math.max(nextRenderWaitStart, expectedRenderCount);

            return waitFor(function didRender() {
                return renderCount >= expectedRenderCount;
            });
        },
        async waitForRenderCount(count: number) {
            return waitFor(function didRenderCount() {
                return renderCount >= count;
            });
        },
        waitUntil: waitFor
    });
}
