import type React from 'react';
import type { ReconcilerRoot } from 'react-reconciler';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { isIntrospectionRenderError } from '../../render/frame/introspect-render-error.ts';
import {
    createHostContainer,
    type IntrospectionHostContainer,
    validateContainerRefs
} from '../host/introspect-host-tree.ts';
import type { IntrospectionRefs, IntrospectionRenderControl } from '../../public/introspect-public-types.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';
import {
    createReconcilerContainer,
    hasScheduledRootTask,
    reconcilerRuntime,
    renderer
} from './introspect-react-root.ts';
import {
    awaitWaiter,
    createWaiterQueue,
    type WaitOperation,
    waitForOutcome,
    withDeadline
} from './introspect-wait.ts';

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
        return createReconcilerContainer(container, options.diagnostics, options.strictMode);
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
