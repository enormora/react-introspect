import type React from 'react';
import { createProbeList } from './probe-list.ts';
import { createProbeListLocator, createProbeLocator } from './probe-locator.ts';
import { createProbeNode, type SnapshotReader } from './probe-node.ts';
import type { ProbeError, ProbeWarning } from './probe-public-types.ts';
import type {
    RuntimeProbeList,
    RuntimeProbeNode,
    RuntimeProbeOptions,
    RuntimeProbeView
} from './probe-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './probe-selector.ts';
import { createProbeSnapshot, type ProbeSnapshot, type SnapshotNode } from './probe-snapshot.ts';

const emptyErrors: readonly ProbeError[] = Object.freeze([]);
const emptyWarnings: readonly ProbeWarning[] = Object.freeze([]);

function readProbeOptions(options: RuntimeProbeOptions): void {
    Object.freeze({ ...options });
}

function nodeList(
    reader: SnapshotReader,
    snapshot: ProbeSnapshot,
    nodes: readonly SnapshotNode[]
): RuntimeProbeList {
    return createProbeList(nodes.map(function createNode(node) {
        return createProbeNode(reader, snapshot, node);
    }));
}

export function createProbeView(element: React.ReactElement, options: RuntimeProbeOptions = {}): RuntimeProbeView {
    let currentSnapshot = createProbeSnapshot(element, 1);
    const state: SnapshotReader = {
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
        const nodes = currentSnapshot
            .nodes
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
            currentSnapshot = {
                nodes: Object.freeze([]),
                renderCount: currentSnapshot.renderCount + 1,
                root: undefined
            };
        },
        update(nextElement: React.ReactElement) {
            currentSnapshot = createProbeSnapshot(nextElement, currentSnapshot.renderCount + 1);
        },
        async waitForIdle() {
            await Promise.resolve();
        },
        async waitForNextRender() {
            await Promise.resolve();
        },
        async waitForRenderCount(count: number) {
            await Promise.resolve(count);
        },
        async waitUntil(predicate: () => boolean) {
            await Promise.resolve(predicate());
        }
    });

    readProbeOptions(options);

    return view;
}
