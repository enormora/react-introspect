import type React from 'react';
import createReconciler, { type ReconcilerRoot } from 'react-reconciler';
// eslint-disable-next-line import/extensions -- react-reconciler has no exports map, so Node needs the file name
import { ConcurrentRoot } from 'react-reconciler/constants.js';
import {
    createIntrospectionHostConfig,
    type IntrospectionHostContainer,
    noHostTimeout
} from '../host/host-tree.ts';
import { isObject } from '../../values/value-kinds.ts';
import type { IntrospectionRuntimeDependencies } from '../scheduling/runtime-dependencies-types.ts';
import { createIntrospectionReconcilerRuntime } from '../scheduling/runtime-scoped-scheduling.ts';

export type ReconcilerRootErrorRecorders = {
    readonly recordCaughtError: (cause: unknown) => void;
    readonly recordRecoverableError: (cause: unknown) => void;
    readonly recordUncaughtError: (cause: unknown) => void;
};

const reactActEnvironmentKey = 'IS_REACT_ACT_ENVIRONMENT';

export const reconcilerRuntime = createIntrospectionReconcilerRuntime();
const renderer = createReconciler(createIntrospectionHostConfig(reconcilerRuntime));

export function createReconcilerContainer(
    runtime: IntrospectionRuntimeDependencies,
    container: IntrospectionHostContainer,
    errorRecorders: ReconcilerRootErrorRecorders,
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
            errorRecorders.recordUncaughtError,
            errorRecorders.recordCaughtError,
            errorRecorders.recordRecoverableError,
            null
        );
    });
}

function readRootField(root: ReconcilerRoot, field: string): unknown {
    if (!Object.hasOwn(root, field)) {
        throw new Error(`React Introspect expected the React root to expose ${field}.`);
    }

    return root[field];
}

function hasScheduledRootTask(root: ReconcilerRoot): boolean {
    const task = readRootField(root, 'callbackNode');

    return isObject(task) && typeof task.callback === 'function';
}

function hasPendingRootWork(root: ReconcilerRoot): boolean {
    return hasScheduledRootTask(root) || readRootField(root, 'timeoutHandle') !== noHostTimeout;
}

function runOutsideReactActEnvironment<Result>(action: () => Result): Result {
    if (Reflect.get(globalThis, reactActEnvironmentKey) !== true) {
        return action();
    }

    Reflect.set(globalThis, reactActEnvironmentKey, false);

    try {
        return action();
    } finally {
        Reflect.set(globalThis, reactActEnvironmentKey, true);
    }
}

function commitSynchronously<Result>(runtime: IntrospectionRuntimeDependencies, action: () => Result): Result {
    return reconcilerRuntime.run(runtime, function commitWithRuntime() {
        return runOutsideReactActEnvironment(function commitOutsideActEnvironment() {
            const result = action();

            renderer.flushSyncWork();
            renderer.flushPassiveEffects();

            return result;
        });
    });
}

export function dispatchDiscreteUpdate<Result>(
    runtime: IntrospectionRuntimeDependencies,
    action: () => Result
): Result {
    return commitSynchronously(runtime, function dispatchAtDiscretePriority() {
        return renderer.discreteUpdates(action);
    });
}

export async function flushScheduledWork(
    runtime: IntrospectionRuntimeDependencies,
    root: ReconcilerRoot
): Promise<void> {
    do {
        await runtime.macrotasks.waitForNext();
    } while (hasPendingRootWork(root));
}

export function renderRootElement(
    runtime: IntrospectionRuntimeDependencies,
    root: ReconcilerRoot,
    element: Readonly<React.ReactElement> | null
): void {
    commitSynchronously(runtime, function renderElement() {
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
