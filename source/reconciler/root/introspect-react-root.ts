import createReconciler, { type ReconcilerRoot } from 'react-reconciler';
// eslint-disable-next-line import/extensions -- react-reconciler has no exports map, so Node needs the file name
import { ConcurrentRoot } from 'react-reconciler/constants.js';
import type { IntrospectionDiagnostics } from '../../diagnostics/introspect-diagnostics.ts';
import { createIntrospectionHostConfig, type IntrospectionHostContainer } from '../host/introspect-host-tree.ts';
import { isObject } from '../../values/introspect-value-kinds.ts';
import { createIntrospectionReconcilerRuntime } from './introspect-reconciler-runtime.ts';

export const reconcilerRuntime = createIntrospectionReconcilerRuntime();
export const renderer = createReconciler(createIntrospectionHostConfig(reconcilerRuntime));

export function createReconcilerContainer(
    container: IntrospectionHostContainer,
    diagnostics: IntrospectionDiagnostics,
    strictMode: boolean
): ReconcilerRoot {
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
}

export function hasScheduledRootTask(root: ReconcilerRoot): boolean {
    const task = root.callbackNode;

    return isObject(task) && typeof task.callback === 'function';
}
