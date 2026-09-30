import type React from 'react';
import {
    createIntrospectionDiagnostics,
    type IntrospectionConsoleDiagnostics,
    type IntrospectionDiagnosticsOptions
} from '../../diagnostics/render-diagnostics.ts';
import { createFrameDepth } from '../../render/frame/frame-depth.ts';
import { createIntrospectionRenderElement } from '../../render/frame/element-frames.ts';
import {
    createIntrospectionListLocator,
    createIntrospectionLocator
} from '../query/node-locator.ts';
import {
    createSnapshotQuery,
    type SnapshotQuery,
    type SnapshotReader
} from '../query/snapshot-query.ts';
import type { IntrospectionOptions } from '../../public/public-types.ts';
import type { IntrospectionReconcilerModule } from '../../reconciler/root/root-lifecycle.ts';
import type { RuntimeIntrospectionNode, RuntimeIntrospectionView } from '../types/runtime-types.ts';
import {
    createEmptyIntrospectionSnapshot
} from '../../snapshot/model/snapshot-contract.ts';

type IntrospectionViewFactory = (
    element: React.ReactElement,
    options: IntrospectionOptions
) => RuntimeIntrospectionView;

export type IntrospectionViewModule = {
    readonly createView: IntrospectionViewFactory;
    readonly preconfigure: (defaults: IntrospectionOptions) => IntrospectionViewFactory;
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

function diagnosticsOptions(options: IntrospectionOptions): IntrospectionDiagnosticsOptions {
    return {
        errorMode: options.errorMode ?? 'capture',
        warningMode: options.warningMode ?? 'throw'
    };
}

function createIntrospectionViewWithDependencies(
    element: React.ReactElement,
    options: IntrospectionOptions,
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
        },
        hostEvent: options.hostEvent ?? {}
    };

    function currentQuery(): SnapshotQuery {
        return createSnapshotQuery(state, currentSnapshot);
    }

    function rootNode(): RuntimeIntrospectionNode | undefined {
        const { root } = currentSnapshot;

        return root === undefined ? undefined : currentQuery().node(root);
    }

    const view: RuntimeIntrospectionView = Object.freeze({
        [Symbol.dispose]() {
            reconcilerRoot.unmount();
        },
        get caughtErrors() {
            return diagnostics.caughtErrors;
        },
        get hasWarnings() {
            return diagnostics.hasWarnings;
        },
        get renderCount() {
            return currentSnapshot.renderCount;
        },
        get renderedChildren() {
            const { root } = currentSnapshot;

            return currentQuery().list(root?.renderedChildren ?? []);
        },
        get root() {
            return rootNode();
        },
        get textContent() {
            return rootNode()?.textContent ?? '';
        },
        get uncaughtErrors() {
            return diagnostics.uncaughtErrors;
        },
        get warnings() {
            return diagnostics.warnings;
        },
        find(selector: unknown) {
            return currentQuery().findAll(selector).first;
        },
        findAll(selector: unknown) {
            return currentQuery().findAll(selector);
        },
        formatTree() {
            return rootNode()?.formatTree() ?? '';
        },
        locate(selector: unknown) {
            return createIntrospectionLocator(view, selector);
        },
        locateAll(selector: unknown) {
            return createIntrospectionListLocator(view, selector);
        },
        unmount: reconcilerRoot.unmount,
        update(nextElement: React.ReactElement) {
            reconcilerRoot.update(createIntrospectionRenderElement(nextElement, depth));
        },
        waitForIdle: reconcilerRoot.waitForIdle,
        waitForNextRender: reconcilerRoot.waitForNextRender,
        waitForRenderCount: reconcilerRoot.waitForRenderCount,
        waitUntil: reconcilerRoot.waitUntil
    });

    return view;
}

export function createIntrospectionViewModule(
    dependencies: IntrospectionViewModuleDependencies
): IntrospectionViewModule {
    return {
        createView(element, options) {
            return createIntrospectionViewWithDependencies(element, options, dependencies);
        },
        preconfigure(defaults) {
            return function createPreconfiguredView(element, options) {
                return createIntrospectionViewWithDependencies(element, { ...defaults, ...options }, dependencies);
            };
        }
    };
}
