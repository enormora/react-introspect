import type { IntrospectionNodeState } from '../../public/introspect-public-types.ts';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionNode,
    RuntimeRenderedChildren
} from '../types/introspect-runtime-types.ts';
import {
    type IntrospectionSnapshot,
    isSnapshotNode,
    type SnapshotNode,
    type SnapshotProps
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import { nodeMatchesSelector, toSelector } from './introspect-selector.ts';
import { createIntrospectionList } from './introspect-list.ts';

export type SnapshotReader = {
    readonly currentSnapshot: IntrospectionSnapshot;
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

function nodeState(node: SnapshotNode): IntrospectionNodeState {
    return Object.freeze({
        activityMode: node.activityMode,
        reason: node.renderedReason ?? (node.visibility === 'hidden' ? 'activity' : undefined),
        rendered: node.renderedReason === undefined,
        visible: node.visibility === 'visible'
    });
}

function findSnapshotNode(snapshot: IntrospectionSnapshot, id: number): SnapshotNode | undefined {
    return snapshot.nodes.find(function hasNodeId(node) {
        return node.id === id;
    });
}

function isPlainPropObject(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

const propElementExposure = {
    exposeProps(
        props: SnapshotProps,
        createPropNode: (propNode: SnapshotNode) => RuntimeIntrospectionNode
    ): SnapshotProps {
        const exposed: Record<PropertyKey, unknown> = {};

        for (const key of Reflect.ownKeys(props)) {
            exposed[key] = propElementExposure.exposeValue(props[key], createPropNode);
        }

        return Object.freeze(exposed);
    },
    exposeValue(value: unknown, createPropNode: (propNode: SnapshotNode) => RuntimeIntrospectionNode): unknown {
        if (isSnapshotNode(value)) {
            return createPropNode(value);
        }

        if (Array.isArray(value)) {
            return Object.freeze(value.map(function exposeItem(item: unknown) {
                return propElementExposure.exposeValue(item, createPropNode);
            }));
        }

        return isPlainPropObject(value) ? propElementExposure.exposeProps(value, createPropNode) : value;
    }
};

const exposedPropsBySnapshotNode = new WeakMap<SnapshotNode, SnapshotProps>();

export function createIntrospectionNode(
    reader: SnapshotReader,
    snapshot: IntrospectionSnapshot,
    node: SnapshotNode
): RuntimeIntrospectionNode {
    const context = { reader, snapshot };

    function readProps(): SnapshotProps {
        const cachedProps = exposedPropsBySnapshotNode.get(node);

        if (cachedProps !== undefined) {
            return cachedProps;
        }

        const exposedProps = propElementExposure.exposeProps(node.props, function createPropNode(propNode) {
            return createIntrospectionNode(reader, snapshot, propNode);
        });

        exposedPropsBySnapshotNode.set(node, exposedProps);

        return exposedProps;
    }

    function createNodeList(nodes: readonly SnapshotNode[]): RuntimeIntrospectionList {
        return createIntrospectionList(nodes.map(function createChildNode(child) {
            return createIntrospectionNode(context.reader, context.snapshot, child);
        }));
    }

    function readRenderedChildren(): RuntimeRenderedChildren {
        if (node.renderedReason !== undefined && node.renderedReason !== 'depth') {
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

    function descendants(): readonly RuntimeIntrospectionNode[] {
        return collectDescendants(node).map(function createDescendantNode(descendant) {
            return createIntrospectionNode(reader, snapshot, descendant);
        });
    }

    function findAll(selector: unknown): RuntimeIntrospectionList {
        const normalizedSelector = toSelector(selector);

        return createIntrospectionList(
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
        get kind() {
            return node.kind;
        },
        get name() {
            return node.name;
        },
        get path() {
            return node.path;
        },
        get props() {
            return readProps();
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
            return node.renderedReason === undefined ? node.visibility : 'notRendered';
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
                const parentNode = createIntrospectionNode(reader, snapshot, parent);

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
            return omitProperties(readProps(), keys);
        },
        pickProps(keys: readonly PropertyKey[]) {
            return pickProperties(readProps(), keys);
        },
        sendEvent(name: string, ...parameters: readonly unknown[]) {
            const eventName = `on${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;

            return reader.act(function sendSnapshotEvent() {
                return callProp(node.props, eventName, parameters);
            });
        }
    });
}

function snapshotTreeNodes(snapshot: IntrospectionSnapshot): readonly SnapshotNode[] {
    function collect(node: SnapshotNode): readonly SnapshotNode[] {
        return [
            node,
            ...node.renderedChildren.flatMap(collect)
        ];
    }

    return snapshot.root === undefined ? Object.freeze([]) : collect(snapshot.root);
}

export function createIntrospectionNodeList(
    reader: SnapshotReader,
    snapshot: IntrospectionSnapshot,
    nodes: readonly SnapshotNode[]
): RuntimeIntrospectionList {
    return createIntrospectionList(nodes.map(function createNode(node) {
        return createIntrospectionNode(reader, snapshot, node);
    }));
}

export function findIntrospectionNodes(
    reader: SnapshotReader,
    snapshot: IntrospectionSnapshot,
    selector: unknown
): RuntimeIntrospectionList {
    const normalizedSelector = toSelector(selector);
    const nodes = snapshotTreeNodes(snapshot)
        .map(function createNode(node) {
            return createIntrospectionNode(reader, snapshot, node);
        })
        .filter(function isMatch(node) {
            return nodeMatchesSelector(node, normalizedSelector);
        });

    return createIntrospectionList(nodes);
}
