import * as timers from 'node:timers';
import React from 'react';
import createReconciler from 'react-reconciler';
import { createEmptyProbeSnapshot, createProbeSnapshot, type ProbeSnapshot } from './probe-snapshot.ts';

type ProbeHostProps = Readonly<Record<PropertyKey, unknown>>;

type ProbeHostParent = ProbeHostContainer | ProbeHostInstance;

type ProbeHostChild = ProbeHostInstance | ProbeTextInstance;

type ProbeChildStore = {
    readonly readChildren: () => readonly ProbeHostChild[];
    readonly writeChildren: (children: readonly ProbeHostChild[]) => void;
};

type ProbeHostContainer = {
    readonly publish: (snapshot: ProbeSnapshot) => void;
    readonly readNextRenderCount: () => number;
    readonly readMounted: () => boolean;
    readonly writeMounted: (mounted: boolean) => void;
} & ProbeChildStore;

type ProbeHostInstance = {
    readonly readProps: () => ProbeHostProps;
    readonly type: string;
    readonly writeProps: (props: ProbeHostProps) => void;
} & ProbeChildStore;

type ProbeTextInstance = {
    readonly readText: () => string;
    readonly writeText: (text: string) => void;
};

type ProbeHostContext = Readonly<Record<PropertyKey, never>>;

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: () => void;
};

type ProbeReconcilerRootOptions = {
    readonly element: React.ReactElement;
    readonly publish: (snapshot: ProbeSnapshot) => void;
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
const parentByChild = new WeakMap<ProbeHostChild, ProbeHostParent>();

function createChildStore(): ProbeChildStore {
    let currentChildren: readonly ProbeHostChild[] = [];

    return Object.freeze({
        readChildren() {
            return currentChildren;
        },
        writeChildren(children: readonly ProbeHostChild[]) {
            currentChildren = children;
        }
    });
}

function publicProps(props: ProbeHostProps): ProbeHostProps {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (key !== 'children' && key !== 'key') {
            result[key] = props[key];
        }
    }

    return Object.freeze(result);
}

function isTextInstance(child: ProbeHostChild): child is ProbeTextInstance {
    return !Reflect.has(child, 'type');
}

function detachChild(child: ProbeHostChild): void {
    const parent = parentByChild.get(child);

    if (parent === undefined) {
        return;
    }

    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

function appendChild(parent: ProbeHostParent, child: ProbeHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren([
        ...children,
        child
    ]);
    parentByChild.set(child, parent);
}

function insertBefore(parent: ProbeHostParent, child: ProbeHostChild, beforeChild: ProbeHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren(children.toSpliced(children.indexOf(beforeChild), 0, child));
    parentByChild.set(child, parent);
}

function removeChild(parent: ProbeHostParent, child: ProbeHostChild): void {
    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

function toReactNode(child: ProbeHostChild): React.ReactNode {
    if (isTextInstance(child)) {
        return child.readText();
    }

    return React.createElement(
        child.type,
        child.readProps(),
        ...child.readChildren().map(toReactNode)
    );
}

function rootNodeFromChildren(children: readonly React.ReactNode[]): React.ReactNode {
    if (children.length === 0) {
        return React.createElement(React.Fragment);
    }

    if (children.length === 1) {
        return children[0];
    }

    return React.createElement(React.Fragment, null, ...children);
}

function toSnapshot(container: ProbeHostContainer): ProbeSnapshot {
    if (!container.readMounted()) {
        return createEmptyProbeSnapshot(container.readNextRenderCount());
    }

    const children = container.readChildren().map(toReactNode);
    const node = rootNodeFromChildren(children);

    return createProbeSnapshot(node, container.readNextRenderCount());
}

function createHostInstance(type: string, props: ProbeHostProps): ProbeHostInstance {
    let currentProps = publicProps(props);

    return Object.freeze({
        ...createChildStore(),
        readProps() {
            return currentProps;
        },
        type,
        writeProps(nextProps: ProbeHostProps) {
            currentProps = publicProps(nextProps);
        }
    });
}

function createTextInstance(text: string): ProbeTextInstance {
    let currentText = text;

    return Object.freeze({
        readText() {
            return currentText;
        },
        writeText(nextText: string) {
            currentText = nextText;
        }
    });
}

function clearContainer(container: ProbeHostContainer): void {
    container.writeChildren([]);
}

const hostContext: ProbeHostContext = Object.freeze({});

function noop(): void {
    return undefined;
}

function alwaysFalse(): boolean {
    return false;
}

function returnNull(): null {
    return null;
}

function getHostContext(): ProbeHostContext {
    return hostContext;
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
    },
    createInstance: createHostInstance,
    createTextInstance,
    detachDeletedInstance: noop,
    finalizeInitialChildren: alwaysFalse,
    getChildHostContext: getHostContext,
    getCurrentUpdatePriority: getDefaultEventPriority,
    getRootHostContext: getHostContext,
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

function createHostContainer(
    publish: (snapshot: ProbeSnapshot) => void,
    readNextRenderCount: () => number
): ProbeHostContainer {
    let mounted = true;

    return Object.freeze({
        ...createChildStore(),
        publish,
        readMounted() {
            return mounted;
        },
        readNextRenderCount,
        writeMounted(nextMounted: boolean) {
            mounted = nextMounted;
        }
    });
}

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
        }
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
