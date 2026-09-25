import type React from 'react';
import {
    createIntrospectionDiagnostics,
    type IntrospectionConsoleDiagnostics,
    type IntrospectionDiagnosticsOptions
} from '../../diagnostics/introspect-diagnostics.ts';
import { createFrameDepth } from '../../render/frame/introspect-frame-contract.ts';
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
import type { IntrospectionReconcilerModule } from '../../reconciler/root/introspect-reconciler.ts';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionOptions,
    RuntimeIntrospectionView
} from '../types/introspect-runtime-types.ts';
import {
    createEmptyIntrospectionSnapshot
} from '../../snapshot/model/introspect-snapshot-contract.ts';

export type IntrospectionViewModule = {
    readonly createView: (
        element: React.ReactElement,
        options: RuntimeIntrospectionOptions
    ) => RuntimeIntrospectionView;
};

export type IntrospectionViewModuleDependencies = {
    readonly consoleDiagnostics: IntrospectionConsoleDiagnostics;
    readonly reconciler: IntrospectionReconcilerModule;
};

const defaultWaitTimeout = 1000;
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

function createIntrospectionViewWithDependencies(
    element: React.ReactElement,
    options: RuntimeIntrospectionOptions,
    dependencies: IntrospectionViewModuleDependencies
): RuntimeIntrospectionView {
    let currentSnapshot = createEmptyIntrospectionSnapshot(0);
    const depth = createFrameDepth({
        budget: options.depth ?? 1,
        depthFrom: options.depthFrom,
        transparent: options.transparent ?? []
    });
    const idPrefix = options.idPrefix ?? createDefaultIdPrefix();
    const diagnostics = createIntrospectionDiagnostics(diagnosticsOptions(options), dependencies.consoleDiagnostics);
    const reconcilerRoot = diagnostics.run(function createRootWithDiagnostics() {
        return dependencies.reconciler.createRoot({
            diagnostics,
            element: createIntrospectionRenderElement(element, depth),
            idGenerator: options.idGenerator,
            idPrefix,
            publish(snapshot) {
                currentSnapshot = snapshot;
            },
            refs: options.refs,
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

export function createIntrospectionViewModule(
    dependencies: IntrospectionViewModuleDependencies
): IntrospectionViewModule {
    return Object.freeze({
        createView(element, options) {
            return createIntrospectionViewWithDependencies(element, options, dependencies);
        }
    });
}
