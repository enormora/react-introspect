import { createProbeList } from './probe-list.ts';
import type { ProbeNodeState } from './probe-public-types.ts';
import type { RuntimeProbeList, RuntimeProbeNode, RuntimeRenderedChildren } from './probe-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './probe-selector.ts';
import type { ProbeSnapshot, SnapshotNode, SnapshotProps } from './probe-snapshot.ts';

export type SnapshotReader = {
    readonly currentSnapshot: ProbeSnapshot;
    readonly act: (action: () => unknown) => unknown;
};

function readProperty(value: SnapshotProps, property: PropertyKey): unknown {
    return value[property];
}

function callProp(props: SnapshotProps, property: string, parameters: readonly unknown[]): unknown {
    const value = readProperty(props, property);

    if (typeof value !== 'function') {
        throw new TypeError(`Prop ${property} is not callable.`);
    }

    return Reflect.apply(value, undefined, parameters);
}

function omitProperties(props: SnapshotProps, keys: readonly PropertyKey[]): SnapshotProps {
    const omitted = { ...props };

    for (const key of keys) {
        Reflect.deleteProperty(omitted, key);
    }

    return Object.freeze(omitted);
}

function pickProperties(props: SnapshotProps, keys: readonly PropertyKey[]): SnapshotProps {
    const picked: Record<PropertyKey, unknown> = {};

    for (const key of keys) {
        picked[key] = props[key];
    }

    return Object.freeze(picked);
}

function collectDescendants(node: SnapshotNode): readonly SnapshotNode[] {
    return node.renderedChildren.flatMap(function collectChild(child) {
        return [
            child,
            ...collectDescendants(child)
        ];
    });
}

function formatNode(node: SnapshotNode, depth: number): string {
    const prefix = '  '.repeat(depth);
    const children = node.renderedChildren.length > 0
        ? `\n${
            node
                .renderedChildren
                .map(function formatChild(child) {
                    return formatNode(child, depth + 1);
                })
                .join('\n')
        }`
        : '';

    return `${prefix}${node.name}${children}`;
}

function nodeState(node: SnapshotNode): ProbeNodeState {
    return Object.freeze({
        activityMode: undefined,
        reason: node.renderedReason,
        rendered: node.renderedReason === undefined,
        visible: true
    });
}

function findSnapshotNode(snapshot: ProbeSnapshot, id: number): SnapshotNode | undefined {
    return snapshot.nodes.find(function hasNodeId(node) {
        return node.id === id;
    });
}

export function createProbeNode(
    reader: SnapshotReader,
    snapshot: ProbeSnapshot,
    node: SnapshotNode
): RuntimeProbeNode {
    const context = { reader, snapshot };

    function createNodeList(nodes: readonly SnapshotNode[]): RuntimeProbeList {
        return createProbeList(nodes.map(function createChildNode(child) {
            return createProbeNode(context.reader, context.snapshot, child);
        }));
    }

    function readRenderedChildren(): RuntimeRenderedChildren {
        if (node.renderedReason !== undefined) {
            return {
                reason: node.renderedReason,
                status: 'notRendered'
            };
        }

        return {
            nodes: createNodeList(node.renderedChildren),
            status: 'rendered'
        };
    }

    function descendants(): readonly RuntimeProbeNode[] {
        return collectDescendants(node).map(function createDescendantNode(descendant) {
            return createProbeNode(reader, snapshot, descendant);
        });
    }

    function findAll(selector: unknown): RuntimeProbeList {
        const normalizedSelector = toSelector(selector);

        return createProbeList(
            descendants().filter(function isMatch(descendant) {
                return nodeMatchesSelector(descendant, normalizedSelector);
            })
        );
    }

    return Object.freeze({
        get error() {
            return node.error;
        },
        get givenChildren() {
            return createNodeList(node.givenChildren);
        },
        get isStale() {
            return reader.currentSnapshot.renderCount !== snapshot.renderCount;
        },
        get key() {
            return node.key;
        },
        get name() {
            return node.name;
        },
        get path() {
            return node.path;
        },
        get props() {
            return node.props;
        },
        get renderedChildren() {
            return readRenderedChildren();
        },
        get state() {
            return nodeState(node);
        },
        get textContent() {
            return node.textContent;
        },
        get type() {
            return node.type;
        },
        get visibility() {
            return node.renderedReason === undefined ? 'visible' : 'notRendered';
        },
        callProp(property: PropertyKey, ...parameters: readonly unknown[]) {
            return reader.act(function callSnapshotProp() {
                return callProp(node.props, String(property), parameters);
            });
        },
        find(selector: unknown) {
            return findAll(selector).first;
        },
        findAll,
        findClosest(selector: unknown) {
            const normalizedSelector = toSelector(selector);
            let parent = node.parentId === undefined ? undefined : findSnapshotNode(snapshot, node.parentId);

            while (parent !== undefined) {
                const parentNode = createProbeNode(reader, snapshot, parent);

                if (nodeMatchesSelector(parentNode, normalizedSelector)) {
                    return parentNode;
                }

                parent = parent.parentId === undefined ? undefined : findSnapshotNode(snapshot, parent.parentId);
            }

            return undefined;
        },
        formatTree() {
            return formatNode(node, 0);
        },
        omitProps(keys: readonly PropertyKey[]) {
            return omitProperties(node.props, keys);
        },
        pickProps(keys: readonly PropertyKey[]) {
            return pickProperties(node.props, keys);
        },
        sendEvent(name: string, ...parameters: readonly unknown[]) {
            const eventName = `on${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;

            return reader.act(function sendSnapshotEvent() {
                return callProp(node.props, eventName, parameters);
            });
        }
    });
}
