import type React from 'react';
import createReconciler, { type ReconcilerRoot } from 'react-reconciler';
// eslint-disable-next-line import/extensions -- react-reconciler has no exports map, so Node needs the file name
import { ConcurrentRoot } from 'react-reconciler/constants.js';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { createIntrospectionHostConfig, type IntrospectionHostContainer } from '../host/introspect-host-tree.ts';
import { isObject } from '../../values/introspect-value-kinds.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/introspect-runtime-dependencies-types.ts';
import { createIntrospectionReconcilerRuntime } from './introspect-reconciler-runtime.ts';

export const reconcilerRuntime = createIntrospectionReconcilerRuntime();
const renderer = createReconciler(createIntrospectionHostConfig(reconcilerRuntime));

export function createReconcilerContainer(
    runtime: IntrospectionRuntimeDependencies,
    container: IntrospectionHostContainer,
    diagnostics: IntrospectionDiagnostics,
    strictMode: boolean
): ReconcilerRoot {
    return reconcilerRuntime.run(runtime, function createContainerWithRuntime() {
        return renderer.createContainer(
            container,
            ConcurrentRoot,
            null,
            strictMode,
            null,
            container.idNormalization.prefix,
            diagnostics.recordUncaughtError,
            diagnostics.recordCaughtError,
            diagnostics.recordRecoverableError,
            null
        );
    });
}

function hasScheduledRootTask(root: ReconcilerRoot): boolean {
    if (!Object.hasOwn(root, 'callbackNode')) {
        throw new Error('React Introspect expected the React root to expose callbackNode.');
    }

    const task = root.callbackNode;

    return isObject(task) && typeof task.callback === 'function';
}

export function actAndFlush(runtime: IntrospectionRuntimeDependencies, action: () => unknown): unknown {
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

export async function flushScheduledWork(
    runtime: IntrospectionRuntimeDependencies,
    root: ReconcilerRoot
): Promise<void> {
    await flushMicrotasks(runtime);

    do {
        await runtime.macrotasks.waitForNext();
        await flushMicrotasks(runtime);
    } while (hasScheduledRootTask(root));
}

export function renderRootElement(
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

export function flushPassiveEffects(runtime: IntrospectionRuntimeDependencies, afterFlush: () => void): void {
    reconcilerRuntime.run(runtime, function flushWithRuntime() {
        renderer.flushPassiveEffects();
        afterFlush();
    });
}
