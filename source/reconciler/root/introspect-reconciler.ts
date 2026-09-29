import type React from 'react';
import createReconciler, { type ReconcilerInstance, type ReconcilerRoot } from 'react-reconciler';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { isIntrospectionRenderError } from '../../render/frame/introspect-render-error.ts';
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
import type { IntrospectionRefs, IntrospectionRenderControl } from '../../public/introspect-public-types.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';
import { isObject } from '../../values/introspect-value-kinds.ts';
import {
    createIntrospectionReconcilerRuntime,
    type IntrospectionReconcilerRuntime
} from './introspect-reconciler-runtime.ts';

type WaiterFailure = { readonly error: unknown; readonly kind: 'failed'; };

type WaiterSatisfied = { readonly kind: 'satisfied'; };

type PredicateOutcome = WaiterFailure | WaiterSatisfied | { readonly kind: 'pending'; };

type WaiterOutcome = WaiterFailure | WaiterSatisfied | { readonly kind: 'cancelled'; };

type DeadlineOutcome<Result> = { readonly kind: 'completed'; readonly value: Result; } | { readonly kind: 'expired'; };

type Waiter = {
    readonly predicate: () => boolean;
    readonly resolve: (outcome: WaiterOutcome) => void;
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

type IntrospectionReconcilerRoot = IntrospectionRenderControl & {
    readonly act: (action: () => unknown) => unknown;
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

type WaitOperation = 'waitForIdle' | 'waitForNextRender' | 'waitForRenderCount' | 'waitUntil';

type WaiterHandle = {
    readonly cancel: () => void;
    readonly settled: Promise<WaiterOutcome>;
};

type WaiterQueue = {
    readonly settle: () => void;
    readonly wait: (predicate: () => boolean) => WaiterHandle;
};

type IntrospectionReconcilerSession = {
    readonly act: (action: () => unknown) => unknown;
    readonly readRenderCount: () => number;
    readonly render: (element: Readonly<React.ReactElement> | null) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitUntil: (operation: WaitOperation, predicate: () => boolean) => Promise<void>;
};

type SessionRenderTarget = {
    readonly container: IntrospectionHostContainer;
    readonly diagnostics: IntrospectionDiagnostics;
    readonly publish: (snapshot: IntrospectionSnapshot) => void;
    readonly readRenderCount: () => number;
};

function outcomeOfSatisfaction(satisfied: boolean): PredicateOutcome {
    return satisfied ? { kind: 'satisfied' } : { kind: 'pending' };
}

function evaluatePredicate(predicate: () => boolean): PredicateOutcome {
    try {
        return outcomeOfSatisfaction(predicate());
    } catch (error) {
        return { error, kind: 'failed' };
    }
}

function createWaiterQueue(): WaiterQueue {
    const waiters = new Set<Waiter>();

    return {
        settle() {
            for (const waiter of Array.from(waiters)) {
                const outcome = evaluatePredicate(waiter.predicate);

                if (outcome.kind !== 'pending') {
                    waiters.delete(waiter);
                    waiter.resolve(outcome);
                }
            }
        },
        wait(predicate) {
            const { promise, resolve } = Promise.withResolvers<WaiterOutcome>();
            const waiter = { predicate, resolve };

            waiters.add(waiter);

            return {
                cancel() {
                    waiters.delete(waiter);
                    resolve({ kind: 'cancelled' });
                },
                settled: promise
            };
        }
    };
}

async function completionOf<Result>(pending: Promise<Result>): Promise<DeadlineOutcome<Result>> {
    return { kind: 'completed', value: await pending };
}

function valueBeforeDeadline<Result>(
    outcome: DeadlineOutcome<Result>,
    operation: WaitOperation,
    timeoutInMilliseconds: number
): Result {
    if (outcome.kind === 'expired') {
        throw new Error(`${operation} timed out after ${timeoutInMilliseconds} ms.`);
    }

    return outcome.value;
}

async function withDeadline<Result>(
    clock: IntrospectionRuntimeDependencies['clock'],
    timeoutInMilliseconds: number,
    operation: WaitOperation,
    pending: Promise<Result>
): Promise<Result> {
    const { promise: expiry, resolve: expire } = Promise.withResolvers<DeadlineOutcome<Result>>();
    const expired: DeadlineOutcome<Result> = { kind: 'expired' };
    const timeoutIdentifier = clock.setTimeout(expire, timeoutInMilliseconds, expired);

    try {
        const outcome = await Promise.race([ completionOf(pending), expiry ]);

        return valueBeforeDeadline(outcome, operation, timeoutInMilliseconds);
    } finally {
        clock.clearTimeout(timeoutIdentifier);
        expire(expired);
    }
}

async function waitForOutcome(waiter: WaiterHandle, flushUntilIdle: () => Promise<void>): Promise<WaiterOutcome> {
    await flushUntilIdle();

    return waiter.settled;
}

function throwFailure(outcome: WaiterOutcome): void {
    if (outcome.kind === 'failed') {
        throw outcome.error;
    }
}

async function awaitWaiter(waiter: WaiterHandle, pending: Promise<WaiterOutcome>): Promise<void> {
    try {
        throwFailure(await pending);
    } finally {
        waiter.cancel();
    }
}

function actAndFlush(runtime: IntrospectionRuntimeDependencies, action: () => unknown): unknown {
    return reconcilerRuntime.run(runtime, function actWithRuntime() {
        return runtime.actEnvironment.act(function runAction() {
            const result = action();

            renderer.flushSyncWork();
            renderer.flushPassiveEffects();

            return result;
        });
    });
}

function hasScheduledRootTask(root: ReconcilerRoot): boolean {
    const task = root.callbackNode;

    return isObject(task) && typeof task.callback === 'function';
}

async function flushMicrotasks(runtime: IntrospectionRuntimeDependencies): Promise<void> {
    await reconcilerRuntime.run(runtime, async function flushMicrotasksWithRuntime() {
        await runtime.microtasks.flush();
    });
}

async function flushScheduledWork(runtime: IntrospectionRuntimeDependencies, root: ReconcilerRoot): Promise<void> {
    await flushMicrotasks(runtime);

    do {
        await runtime.macrotasks.waitForNext();
        await flushMicrotasks(runtime);
    } while (hasScheduledRootTask(root));
}

function publishEmptyErrorSnapshot(target: SessionRenderTarget, renderCountBefore: number): void {
    const errorRenderCount = Math.max(target.readRenderCount(), renderCountBefore + 1);

    target.container.writeMounted(false);
    target.container.writeChildren([]);
    target.publish(createEmptyIntrospectionSnapshot(errorRenderCount));
}

function captureRenderError(target: SessionRenderTarget, error: unknown, renderCountBefore: number): void {
    if (!isIntrospectionRenderError(error)) {
        throw error;
    }

    publishEmptyErrorSnapshot(target, renderCountBefore);
    target.diagnostics.recordUncaughtError(error);
}

function captureMissingInitialCommit(target: SessionRenderTarget, renderCountBefore: number): void {
    if (
        renderCountBefore > 0 ||
        target.readRenderCount() > renderCountBefore ||
        target.diagnostics.uncaughtErrors.length > 0
    ) {
        return;
    }

    const message = 'React Introspect cannot commit a suspended root. ' +
        'Wrap lazy, async, or promise-using roots in React.Suspense.';

    publishEmptyErrorSnapshot(target, renderCountBefore);
    target.diagnostics.recordUncaughtError(new Error(message));
}

function renderRootElement(
    runtime: IntrospectionRuntimeDependencies,
    root: ReconcilerRoot,
    element: Readonly<React.ReactElement> | null
): void {
    actAndFlush(runtime, function renderElement() {
        renderer.flushSyncFromReconciler(function updateContainer() {
            renderer.updateContainer(element, root, null, null);
        });
    });
}

function renderWithDiagnostics(target: SessionRenderTarget, mounted: boolean, commitElement: () => void): void {
    const renderCountBefore = target.readRenderCount();

    target.container.writeMounted(mounted);

    try {
        commitElement();
    } catch (error) {
        captureRenderError(target, error, renderCountBefore);

        return;
    }

    validateContainerRefs(target.container);
    captureMissingInitialCommit(target, renderCountBefore);
}

function createIntrospectionReconcilerSession(
    runtime: IntrospectionRuntimeDependencies,
    options: IntrospectionReconcilerRootOptions
): IntrospectionReconcilerSession {
    let renderCount = 0;
    const waiters = createWaiterQueue();
    const container = createHostContainer(
        function publishSnapshot(snapshot) {
            renderCount = snapshot.renderCount;
            options.publish(snapshot);
            waiters.settle();
        },
        function readNextRenderCount() {
            return renderCount + 1;
        },
        {
            generator: options.idGenerator,
            prefix: options.idPrefix
        },
        options.refs
    );
    const root = reconcilerRuntime.run(runtime, function createContainerWithRuntime() {
        return createReconcilerContainer(renderer, container, options.diagnostics, options.strictMode);
    });
    const target: SessionRenderTarget = {
        container,
        diagnostics: options.diagnostics,
        publish: options.publish,
        readRenderCount() {
            return renderCount;
        }
    };
    async function flushUntilIdle(): Promise<void> {
        await options.diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
            await flushScheduledWork(runtime, root);
            reconcilerRuntime.run(runtime, function flushWithRuntime() {
                renderer.flushPassiveEffects();
                waiters.settle();
            });
        });
    }

    const session: IntrospectionReconcilerSession = {
        act(action) {
            return options.diagnostics.run(function actWithDiagnostics() {
                return actAndFlush(runtime, action);
            });
        },
        readRenderCount: target.readRenderCount,
        render(element) {
            options.diagnostics.run(function renderElementWithDiagnostics() {
                renderWithDiagnostics(target, element !== null, function commitElement() {
                    renderRootElement(runtime, root, element);
                });
            });
        },
        async waitForIdle() {
            await withDeadline(runtime.clock, options.waitTimeout, 'waitForIdle', flushUntilIdle());
        },
        async waitUntil(operation, predicate) {
            if (options.diagnostics.run(predicate)) {
                return;
            }

            const waiter = waiters.wait(predicate);
            const outcome = waitForOutcome(waiter, flushUntilIdle);

            await awaitWaiter(waiter, withDeadline(runtime.clock, options.waitTimeout, operation, outcome));
        }
    };

    return session;
}

async function waitForRenderCount(
    session: IntrospectionReconcilerSession,
    operation: WaitOperation,
    count: number
): Promise<void> {
    return session.waitUntil(operation, function didRenderCount() {
        return session.readRenderCount() >= count;
    });
}

function createIntrospectionReconcilerRoot(
    runtime: IntrospectionRuntimeDependencies,
    options: IntrospectionReconcilerRootOptions
): IntrospectionReconcilerRoot {
    const session = createIntrospectionReconcilerSession(runtime, options);

    session.render(options.element);

    return {
        act: session.act,
        unmount() {
            session.render(null);
        },
        update(element: React.ReactElement) {
            session.render(element);
        },
        waitForIdle: session.waitForIdle,
        async waitForNextRender() {
            return waitForRenderCount(session, 'waitForNextRender', session.readRenderCount() + 1);
        },
        async waitForRenderCount(count: number) {
            return waitForRenderCount(session, 'waitForRenderCount', count);
        },
        async waitUntil(predicate: () => boolean) {
            return session.waitUntil('waitUntil', predicate);
        }
    };
}

export function createIntrospectionReconcilerModule(
    dependencies: IntrospectionReconcilerModuleDependencies
): IntrospectionReconcilerModule {
    reconcilerRuntime.makeDefault(dependencies.runtime);

    return {
        createRoot(options) {
            return createIntrospectionReconcilerRoot(dependencies.runtime, options);
        }
    };
}
