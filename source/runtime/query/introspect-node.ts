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
import { type NestedReplacement, replaceNestedTargets } from '../../values/introspect-nested-replacement.ts';
import { nodeMatchesSelector, toSelector } from './introspect-selector.ts';
import { createIntrospectionList } from './introspect-list.ts';

export type SnapshotReader = {
    readonly currentSnapshot: IntrospectionSnapshot;
    readonly hostEvent: Readonly<Record<PropertyKey, unknown>>;
    readonly act: (action: () => unknown) => unknown;
};

export type SnapshotQuery = {
    readonly findAll: (selector: unknown) => RuntimeIntrospectionList;
    readonly list: (nodes: readonly SnapshotNode[]) => RuntimeIntrospectionList;
    readonly node: (node: SnapshotNode) => RuntimeIntrospectionNode;
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

function isEventOverride(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createHostEvent(
    type: string,
    defaults: Readonly<Record<PropertyKey, unknown>>,
    override: Readonly<Record<PropertyKey, unknown>>
): Readonly<Record<PropertyKey, unknown>> {
    let propagationStopped = false;
    const event: Record<PropertyKey, unknown> = {
        defaultPrevented: false,
        isDefaultPrevented() {
            return event.defaultPrevented === true;
        },
        isPropagationStopped() {
            return propagationStopped;
        },
        preventDefault() {
            event.defaultPrevented = true;
        },
        stopPropagation() {
            propagationStopped = true;
        },
        type,
        ...defaults,
        ...override
    };

    return event;
}

function createHostEventParameters(
    name: string,
    defaults: Readonly<Record<PropertyKey, unknown>>,
    parameters: readonly unknown[]
): readonly unknown[] {
    const [ firstParameter, ...remainingParameters ] = parameters;
    const type = name.toLowerCase();

    if (parameters.length === 0) {
        return [ createHostEvent(type, defaults, {}) ];
    }

    return isEventOverride(firstParameter)
        ? [ createHostEvent(type, defaults, firstParameter), ...remainingParameters ]
        : parameters;
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
        reason: node.renderedReason ?? node.hiddenBy,
        rendered: node.renderedReason === undefined,
        visible: node.renderedReason !== 'unsupported' && node.visibility === 'visible'
    });
}

function findSnapshotNode(snapshot: IntrospectionSnapshot, id: number): SnapshotNode | undefined {
    return snapshot.nodes.find(function hasNodeId(node) {
        return node.id === id;
    });
}

function exposePropElements(
    props: SnapshotProps,
    createPropNode: (propNode: SnapshotNode) => RuntimeIntrospectionNode
): SnapshotProps {
    const replacement: NestedReplacement<SnapshotNode> = {
        ancestors: new WeakSet(),
        isTarget: isSnapshotNode,
        replaceTarget: createPropNode
    };
    const exposed: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        exposed[key] = replaceNestedTargets(props[key], replacement, '');
    }

    return Object.freeze(exposed);
}

const exposedPropsBySnapshotNode = new WeakMap<SnapshotNode, SnapshotProps>();

function exposeSnapshotNode(
    query: SnapshotQuery,
    reader: SnapshotReader,
    snapshot: IntrospectionSnapshot,
    node: SnapshotNode
): RuntimeIntrospectionNode {
    function readProps(): SnapshotProps {
        const cachedProps = exposedPropsBySnapshotNode.get(node);

        if (cachedProps !== undefined) {
            return cachedProps;
        }

        const exposedProps = exposePropElements(node.props, query.node);

        exposedPropsBySnapshotNode.set(node, exposedProps);

        return exposedProps;
    }

    function readRenderedChildren(): RuntimeRenderedChildren {
        if (node.renderedReason !== undefined && node.renderedReason !== 'depth') {
            return {
                reason: node.renderedReason,
                status: 'notRendered'
            };
        }

        return {
            nodes: query.list(node.renderedChildren),
            status: 'rendered'
        };
    }

    function findAll(selector: unknown): RuntimeIntrospectionList {
        return query.list(collectDescendants(node)).filterBy(selector);
    }

    return Object.freeze({
        get caughtError() {
            return node.caughtError;
        },
        get givenChildren() {
            return query.list(node.givenChildren);
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
            return node.renderedReason === 'unsupported' ? 'notRendered' : node.visibility;
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
                const parentNode = query.node(parent);

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
            const eventParameters = node.kind === 'host'
                ? createHostEventParameters(name, reader.hostEvent, parameters)
                : parameters;

            return reader.act(function sendSnapshotEvent() {
                return callProp(node.props, eventName, eventParameters);
            });
        }
    });
}

function snapshotTreeNodes(snapshot: IntrospectionSnapshot): readonly SnapshotNode[] {
    return snapshot.root === undefined ? [] : [ snapshot.root, ...collectDescendants(snapshot.root) ];
}

export function createSnapshotQuery(reader: SnapshotReader, snapshot: IntrospectionSnapshot): SnapshotQuery {
    const query: SnapshotQuery = {
        findAll(selector) {
            return query.list(snapshotTreeNodes(snapshot)).filterBy(selector);
        },
        list(nodes) {
            return createIntrospectionList(nodes.map(query.node));
        },
        node(node) {
            return exposeSnapshotNode(query, reader, snapshot, node);
        }
    };

    return query;
}
