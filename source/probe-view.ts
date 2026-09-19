import type React from 'react';
import { createProbeRenderElement, type ProbeFrameDepth } from './probe-frame.ts';
import { createProbeList } from './probe-list.ts';
import { createProbeListLocator, createProbeLocator } from './probe-locator.ts';
import { createProbeNode, type SnapshotReader } from './probe-node.ts';
import type { ProbeError, ProbeWarning } from './probe-public-types.ts';
import { createProbeReconcilerRoot } from './probe-reconciler.ts';
import type {
    RuntimeProbeList,
    RuntimeProbeNode,
    RuntimeProbeOptions,
    RuntimeProbeView
} from './probe-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './probe-selector.ts';
import {
    createEmptyProbeSnapshot,
    type ProbeSnapshot,
    type SnapshotNode
} from './probe-snapshot.ts';

const emptyErrors: readonly ProbeError[] = Object.freeze([]);
const emptyWarnings: readonly ProbeWarning[] = Object.freeze([]);

function nodeList(
    reader: SnapshotReader,
    snapshot: ProbeSnapshot,
    nodes: readonly SnapshotNode[]
): RuntimeProbeList {
    return createProbeList(nodes.map(function createNode(node) {
        return createProbeNode(reader, snapshot, node);
    }));
}

function snapshotTreeNodes(snapshot: ProbeSnapshot): readonly SnapshotNode[] {
    function collect(node: SnapshotNode): readonly SnapshotNode[] {
        return [
            node,
            ...node.renderedChildren.flatMap(collect)
        ];
    }

    return snapshot.root === undefined ? Object.freeze([]) : collect(snapshot.root);
}

export function createProbeView(element: React.ReactElement, options: RuntimeProbeOptions = {}): RuntimeProbeView {
    let currentSnapshot = createEmptyProbeSnapshot(0);
    const depth: ProbeFrameDepth = options.depth ?? 1;
    const reconcilerRoot = createProbeReconcilerRoot({
        element: createProbeRenderElement(element, depth),
        publish(snapshot) {
            currentSnapshot = snapshot;
        },
        strictMode: options.strictMode ?? true
    });
    const state: SnapshotReader = {
        act(action: () => unknown) {
            return reconcilerRoot.act(action);
        },
        get currentSnapshot() {
            return currentSnapshot;
        }
    };

    function rootNode(): RuntimeProbeNode | undefined {
        const { root } = currentSnapshot;

        return root === undefined ? undefined : createProbeNode(state, currentSnapshot, root);
    }

    function findAll(selector: unknown): RuntimeProbeList {
        const normalizedSelector = toSelector(selector);
        const nodes = snapshotTreeNodes(currentSnapshot)
            .map(function createNode(node) {
                return createProbeNode(state, currentSnapshot, node);
            })
            .filter(function isMatch(node) {
                return nodeMatchesSelector(node, normalizedSelector);
            });

        return createProbeList(nodes);
    }

    const view: RuntimeProbeView = Object.freeze({
        get currentSnapshot() {
            return currentSnapshot;
        },
        get errors() {
            return emptyErrors;
        },
        get hasWarnings() {
            return false;
        },
        get renderCount() {
            return currentSnapshot.renderCount;
        },
        get renderedChildren() {
            const { root } = currentSnapshot;

            return root === undefined
                ? createProbeList([])
                : nodeList(state, currentSnapshot, root.renderedChildren);
        },
        get root() {
            return rootNode();
        },
        get textContent() {
            return rootNode()?.textContent ?? '';
        },
        get warnings() {
            return emptyWarnings;
        },
        find(selector: unknown) {
            return findAll(selector).first;
        },
        findAll,
        formatTree() {
            return rootNode()?.formatTree() ?? '';
        },
        locate(selector: unknown) {
            return createProbeLocator(view, selector);
        },
        locateAll(selector: unknown) {
            return createProbeListLocator(view, selector);
        },
        unmount() {
            reconcilerRoot.unmount();
        },
        update(nextElement: React.ReactElement) {
            reconcilerRoot.update(createProbeRenderElement(nextElement, depth));
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
