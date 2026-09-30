import type React from 'react';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { createHostContainer, type IntrospectionHostContainerControl } from '../host/introspect-host-tree.ts';
import type { IntrospectionRefs, IntrospectionRenderControl } from '../../public/introspect-public-types.ts';
import type { IntrospectionSnapshot } from '../../snapshot/model/introspect-snapshot-contract.ts';
import { isIntrospectionUsageError } from '../../values/introspect-usage-error.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';
import {
    createReconcilerContainer,
    dispatchDiscreteUpdate,
    flushPassiveEffects,
    flushScheduledWork,
    reconcilerRuntime,
    renderRootElement
} from './introspect-react-root.ts';
import {
    createWaiterQueue,
    type WaiterQueue,
    type WaitOperation,
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

type RootRenderTarget = {
    readonly container: IntrospectionHostContainerControl;
    readonly diagnostics: IntrospectionDiagnostics;
    readonly readRenderCount: () => number;
};

function publishEmptyErrorSnapshot(target: RootRenderTarget, renderCountBefore: number): void {
    const errorRenderCount = Math.max(target.readRenderCount(), renderCountBefore + 1);

    target.container.discard(errorRenderCount);
}

function captureCaughtError(target: RootRenderTarget, cause: unknown): void {
    if (isIntrospectionUsageError(cause)) {
        target.diagnostics.holdUsageError(cause);

        return;
    }

    target.diagnostics.recordCaughtError(cause);
}

function captureUncaughtError(target: RootRenderTarget, cause: unknown): void {
    if (isIntrospectionUsageError(cause)) {
        target.diagnostics.holdUsageError(cause);

        return;
    }

    target.container.discard(target.readRenderCount());
    target.diagnostics.recordUncaughtError(cause);
}

function captureMissingInitialCommit(target: RootRenderTarget, renderCountBefore: number): void {
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

function renderWithDiagnostics(target: RootRenderTarget, mounted: boolean, commitElement: () => void): void {
    const renderCountBefore = target.readRenderCount();

    target.container.beginCommit(mounted);
    commitElement();

    if (target.diagnostics.holdsUsageError()) {
        return;
    }

    target.container.validateRefs();
    captureMissingInitialCommit(target, renderCountBefore);
}

type RootWaitDependencies = {
    readonly clock: IntrospectionRuntimeDependencies['clock'];
    readonly diagnostics: IntrospectionDiagnostics;
    readonly flushUntilIdle: () => Promise<void>;
    readonly readRenderCount: () => number;
    readonly timeoutInMilliseconds: number;
    readonly waiters: WaiterQueue;
};

type RootWaits = Pick<
    IntrospectionReconcilerRoot,
    'waitForIdle' | 'waitForNextRender' | 'waitForRenderCount' | 'waitUntil'
>;

function createRootWaits(dependencies: RootWaitDependencies): RootWaits {
    const { clock, diagnostics, flushUntilIdle, readRenderCount, timeoutInMilliseconds, waiters } = dependencies;

    async function waitUntil(operation: WaitOperation, predicate: () => boolean): Promise<void> {
        await diagnostics.runAsync(async function waitUntilWithDiagnostics() {
            if (predicate()) {
                return;
            }

            await waiters.waitUntil(predicate, { clock, flushUntilIdle, operation, timeoutInMilliseconds });
        });
    }

    async function waitForRenderCount(operation: WaitOperation, count: number): Promise<void> {
        await waitUntil(operation, function didRenderCount() {
            return readRenderCount() >= count;
        });
    }

    return {
        async waitForIdle() {
            await diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
                await withDeadline(clock, timeoutInMilliseconds, 'waitForIdle', flushUntilIdle());
            });
        },
        async waitForNextRender() {
            await waitForRenderCount('waitForNextRender', readRenderCount() + 1);
        },
        async waitForRenderCount(count: number) {
            await waitForRenderCount('waitForRenderCount', count);
        },
        async waitUntil(predicate: () => boolean) {
            await waitUntil('waitUntil', predicate);
        }
    };
}

function createIntrospectionReconcilerRoot(
    runtime: IntrospectionRuntimeDependencies,
    options: IntrospectionReconcilerRootOptions
): IntrospectionReconcilerRoot {
    let renderCount = 0;
    const waiters = createWaiterQueue();
    const container = createHostContainer(
        {
            publish(snapshot) {
                renderCount = snapshot.renderCount;
                options.publish(snapshot);
                waiters.settle();
            },
            readNextRenderCount() {
                return renderCount + 1;
            }
        },
        {
            generator: options.idGenerator,
            prefix: options.idPrefix
        },
        options.refs
    );
    const target: RootRenderTarget = {
        container,
        diagnostics: options.diagnostics,
        readRenderCount() {
            return renderCount;
        }
    };
    const root = createReconcilerContainer(runtime, container, {
        recordCaughtError(cause) {
            captureCaughtError(target, cause);
        },
        recordRecoverableError: options.diagnostics.recordRecoverableError,
        recordUncaughtError(cause) {
            captureUncaughtError(target, cause);
        }
    }, options.strictMode);
    async function flushUntilIdle(): Promise<void> {
        await flushScheduledWork(runtime, root);
        flushPassiveEffects(runtime, waiters.settle);
    }

    function render(element: Readonly<React.ReactElement> | null): void {
        options.diagnostics.run(function renderElementWithDiagnostics() {
            renderWithDiagnostics(target, element !== null, function commitElement() {
                renderRootElement(runtime, root, element);
            });
        });
    }

    const waits = createRootWaits({
        clock: runtime.clock,
        diagnostics: options.diagnostics,
        flushUntilIdle,
        readRenderCount: target.readRenderCount,
        timeoutInMilliseconds: options.waitTimeout,
        waiters
    });

    render(options.element);

    return {
        act(action) {
            return options.diagnostics.run(function actWithDiagnostics() {
                return dispatchDiscreteUpdate(runtime, action);
            });
        },
        unmount() {
            if (container.readMounted()) {
                render(null);
            }
        },
        update: render,
        ...waits
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
