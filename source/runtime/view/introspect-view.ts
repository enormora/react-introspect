import type React from 'react';
import {
    createIntrospectionDiagnostics,
    type IntrospectionConsoleDiagnostics,
    type IntrospectionDiagnosticsOptions
} from '../../diagnostics/introspect-diagnostics.ts';
import { createIntrospectionRenderElement } from '../../render/frame/introspect-frame.ts';
import {
    createIntrospectionListLocator,
    createIntrospectionLocator
} from '../query/introspect-locator.ts';
import {
    createIntrospectionNode,
    createIntrospectionNodeList,
    findIntrospectionNodes,
    type SnapshotReader
} from '../query/introspect-node.ts';
import { createIntrospectionReconcilerRoot } from '../../reconciler/root/introspect-reconciler.ts';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionOptions,
    RuntimeIntrospectionView
} from '../types/introspect-runtime-types.ts';
import {
    createEmptyIntrospectionSnapshot
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import {
    createUnitRuntimeDependencies,
    type IntrospectionRuntimeDependencies
} from './introspect-runtime-dependencies.ts';

const defaultWaitTimeout = 1000;
const isolatedConsoleDiagnostics: IntrospectionConsoleDiagnostics = Object.freeze({
    subscribe() {
        return undefined;
    }
});
const createDefaultIdPrefix = (function createDefaultIdPrefixFactory() {
    let nextIdPrefixIndex = 0;

    return function createIdPrefix() {
        nextIdPrefixIndex += 1;

        return `react-introspect-${nextIdPrefixIndex}-`;
    };
})();

function diagnosticsOptions(options: RuntimeIntrospectionOptions): IntrospectionDiagnosticsOptions {
    return {
        errorMode: options.errorMode ?? 'capture',
        warningMode: options.warningMode ?? 'throw'
    };
}

export function createIntrospectionView(
    element: React.ReactElement,
    options: RuntimeIntrospectionOptions = {},
    consoleDiagnostics: IntrospectionConsoleDiagnostics = isolatedConsoleDiagnostics,
    runtimeDependencies: IntrospectionRuntimeDependencies = createUnitRuntimeDependencies()
): RuntimeIntrospectionView {
    let currentSnapshot = createEmptyIntrospectionSnapshot(0);
    const depth = options.depth ?? 1;
    const idPrefix = options.idPrefix ?? createDefaultIdPrefix();
    const diagnostics = createIntrospectionDiagnostics(diagnosticsOptions(options), consoleDiagnostics);
    const reconcilerRoot = diagnostics.run(function createRootWithDiagnostics() {
        return createIntrospectionReconcilerRoot({
            diagnostics,
            element: createIntrospectionRenderElement(element, depth),
            idGenerator: options.idGenerator,
            idPrefix,
            publish(snapshot) {
                currentSnapshot = snapshot;
            },
            refs: options.refs,
            runtime: runtimeDependencies,
            strictMode: options.strictMode ?? true,
            waitTimeout: options.waitTimeout ?? defaultWaitTimeout
        });
    });
    const state: SnapshotReader = {
        act(action: () => unknown) {
            return reconcilerRoot.act(action);
        },
        get currentSnapshot() {
            return currentSnapshot;
        }
    };

    function rootNode(): RuntimeIntrospectionNode | undefined {
        const { root } = currentSnapshot;

        return root === undefined ? undefined : createIntrospectionNode(state, currentSnapshot, root);
    }

    function findAll(selector: unknown): RuntimeIntrospectionList {
        return findIntrospectionNodes(state, currentSnapshot, selector);
    }

    const view: RuntimeIntrospectionView = Object.freeze({
        get currentSnapshot() {
            return currentSnapshot;
        },
        get errors() {
            return diagnostics.errors;
        },
        get hasWarnings() {
            return diagnostics.hasWarnings;
        },
        get renderCount() {
            return currentSnapshot.renderCount;
        },
        get renderedChildren() {
            const { root } = currentSnapshot;

            return createIntrospectionNodeList(state, currentSnapshot, root?.renderedChildren ?? []);
        },
        get root() {
            return rootNode();
        },
        get textContent() {
            return rootNode()?.textContent ?? '';
        },
        get warnings() {
            return diagnostics.warnings;
        },
        find(selector: unknown) {
            return findAll(selector).first;
        },
        findAll,
        formatTree() {
            return rootNode()?.formatTree() ?? '';
        },
        locate(selector: unknown) {
            return createIntrospectionLocator(view, selector);
        },
        locateAll(selector: unknown) {
            return createIntrospectionListLocator(view, selector);
        },
        unmount() {
            reconcilerRoot.unmount();
        },
        update(nextElement: React.ReactElement) {
            reconcilerRoot.update(createIntrospectionRenderElement(nextElement, depth));
        },
        async waitForIdle() {
            await reconcilerRoot.waitForIdle();
        },
        async waitForNextRender() {
            await reconcilerRoot.waitForNextRender();
        },
        async waitForRenderCount(count: number) {
            await reconcilerRoot.waitForRenderCount(count);
        },
        async waitUntil(predicate: () => boolean) {
            await reconcilerRoot.waitUntil(predicate);
        }
    });

    return view;
}
