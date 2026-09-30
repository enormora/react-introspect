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

type IntrospectionReconcilerSession = {
    readonly act: (action: () => unknown) => unknown;
    readonly readMounted: () => boolean;
    readonly readRenderCount: () => number;
    readonly render: (element: Readonly<React.ReactElement> | null) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitUntil: (operation: WaitOperation, predicate: () => boolean) => Promise<void>;
};

type SessionRenderTarget = {
    readonly container: IntrospectionHostContainerControl;
    readonly diagnostics: IntrospectionDiagnostics;
    readonly readRenderCount: () => number;
};

function publishEmptyErrorSnapshot(target: SessionRenderTarget, renderCountBefore: number): void {
    const errorRenderCount = Math.max(target.readRenderCount(), renderCountBefore + 1);

    target.container.discard(errorRenderCount);
}

function captureCaughtError(target: SessionRenderTarget, cause: unknown): void {
    if (isIntrospectionUsageError(cause)) {
        target.diagnostics.holdUsageError(cause);

        return;
    }

    target.diagnostics.recordCaughtError(cause);
}

function captureUncaughtError(target: SessionRenderTarget, cause: unknown): void {
    if (isIntrospectionUsageError(cause)) {
        target.diagnostics.holdUsageError(cause);

        return;
    }

    target.container.discard(target.readRenderCount());
    target.diagnostics.recordUncaughtError(cause);
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

function renderWithDiagnostics(target: SessionRenderTarget, mounted: boolean, commitElement: () => void): void {
    const renderCountBefore = target.readRenderCount();

    target.container.beginCommit(mounted);
    commitElement();

    if (target.diagnostics.holdsUsageError()) {
        return;
    }

    target.container.validateRefs();
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
    const target: SessionRenderTarget = {
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

    const session: IntrospectionReconcilerSession = {
        act(action) {
            return options.diagnostics.run(function actWithDiagnostics() {
                return dispatchDiscreteUpdate(runtime, action);
            });
        },
        readMounted: container.readMounted,
        readRenderCount: target.readRenderCount,
        render(element) {
            options.diagnostics.run(function renderElementWithDiagnostics() {
                renderWithDiagnostics(target, element !== null, function commitElement() {
                    renderRootElement(runtime, root, element);
                });
            });
        },
        async waitForIdle() {
            await options.diagnostics.runAsync(async function waitForIdleWithDiagnostics() {
                await withDeadline(runtime.clock, options.waitTimeout, 'waitForIdle', flushUntilIdle());
            });
        },
        async waitUntil(operation, predicate) {
            await options.diagnostics.runAsync(async function waitUntilWithDiagnostics() {
                if (predicate()) {
                    return;
                }

                await waiters.waitUntil(predicate, {
                    clock: runtime.clock,
                    flushUntilIdle,
                    operation,
                    timeoutInMilliseconds: options.waitTimeout
                });
            });
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
            if (session.readMounted()) {
                session.render(null);
            }
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
