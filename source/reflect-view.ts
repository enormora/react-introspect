import type React from 'react';
import { createReflectDiagnostics } from './reflect-diagnostics.ts';
import { createReflectRenderElement } from './reflect-frame.ts';
import { createReflectList } from './reflect-list.ts';
import { createReflectListLocator, createReflectLocator } from './reflect-locator.ts';
import { createReflectNode, type SnapshotReader } from './reflect-node.ts';
import { createReflectReconcilerRoot } from './reflect-reconciler.ts';
import type {
    RuntimeReflectList,
    RuntimeReflectNode,
    RuntimeReflectOptions,
    RuntimeReflectView
} from './reflect-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './reflect-selector.ts';
import {
    createEmptyReflectSnapshot,
    type ReflectSnapshot,
    type SnapshotNode
} from './reflect-snapshot-contract.ts';

const defaultWaitTimeout = 1000;
const createDefaultIdPrefix = (function createDefaultIdPrefixFactory() {
    let nextIdPrefixIndex = 0;

    return function createIdPrefix() {
        nextIdPrefixIndex += 1;

        return `react-reflect-${nextIdPrefixIndex}-`;
    };
})();

function nodeList(
    reader: SnapshotReader,
    snapshot: ReflectSnapshot,
    nodes: readonly SnapshotNode[]
): RuntimeReflectList {
    return createReflectList(nodes.map(function createNode(node) {
        return createReflectNode(reader, snapshot, node);
    }));
}

function snapshotTreeNodes(snapshot: ReflectSnapshot): readonly SnapshotNode[] {
    function collect(node: SnapshotNode): readonly SnapshotNode[] {
        return [
            node,
            ...node.renderedChildren.flatMap(collect)
        ];
    }

    return snapshot.root === undefined ? Object.freeze([]) : collect(snapshot.root);
}

export function createReflectView(
    element: React.ReactElement,
    options: RuntimeReflectOptions = {}
): RuntimeReflectView {
    let currentSnapshot = createEmptyReflectSnapshot(0);
    const depth = options.depth ?? 1;
    const idPrefix = options.idPrefix ?? createDefaultIdPrefix();
    const diagnostics = createReflectDiagnostics({
        errorMode: options.errorMode ?? 'capture',
        warningMode: options.warningMode ?? 'throw'
    });
    const reconcilerRoot = diagnostics.run(function createRootWithDiagnostics() {
        return createReflectReconcilerRoot({
            diagnostics,
            element: createReflectRenderElement(element, depth),
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

    function rootNode(): RuntimeReflectNode | undefined {
        const { root } = currentSnapshot;

        return root === undefined ? undefined : createReflectNode(state, currentSnapshot, root);
    }

    function findAll(selector: unknown): RuntimeReflectList {
        const normalizedSelector = toSelector(selector);
        const nodes = snapshotTreeNodes(currentSnapshot)
            .map(function createNode(node) {
                return createReflectNode(state, currentSnapshot, node);
            })
            .filter(function isMatch(node) {
                return nodeMatchesSelector(node, normalizedSelector);
            });

        return createReflectList(nodes);
    }

    const view: RuntimeReflectView = Object.freeze({
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

            return root === undefined
                ? createReflectList([])
                : nodeList(state, currentSnapshot, root.renderedChildren);
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
            return createReflectLocator(view, selector);
        },
        locateAll(selector: unknown) {
            return createReflectListLocator(view, selector);
        },
        unmount() {
            reconcilerRoot.unmount();
        },
        update(nextElement: React.ReactElement) {
            reconcilerRoot.update(createReflectRenderElement(nextElement, depth));
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
