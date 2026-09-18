import React from 'react';
import type { ProbeNotRenderedReason } from './probe-public-types.ts';

export type ProbeSnapshot = {
    readonly nodes: readonly SnapshotNode[];
    readonly renderCount: number;
    readonly root: SnapshotNode | undefined;
};

export type SnapshotProps = Readonly<Record<PropertyKey, unknown>>;

export type SnapshotNode = {
    readonly givenChildren: readonly SnapshotNode[];
    readonly id: number;
    readonly key: string | null;
    readonly name: string;
    readonly parent: SnapshotNode | undefined;
    readonly path: string;
    readonly props: SnapshotProps;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly textContent: string;
    readonly type: unknown;
};

type SnapshotBuild = {
    readonly nextId: number;
    readonly nodes: readonly SnapshotNode[];
};

type SnapshotNodeInput = {
    readonly givenChildren: readonly SnapshotNode[];
    readonly key: string | null;
    readonly name: string;
    readonly parent: SnapshotNode | undefined;
    readonly path: string;
    readonly props: SnapshotProps;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly textContent: string;
    readonly type: unknown;
};

type SnapshotNodeRequest = {
    readonly build: SnapshotBuild;
    readonly index: number;
    readonly node: unknown;
    readonly parent: SnapshotNode | undefined;
    readonly parentPath: string;
};

type ElementNodeRequest = SnapshotNodeRequest & {
    readonly element: React.ReactElement<SnapshotProps>;
};

type ChildSnapshotsRequest = {
    readonly build: SnapshotBuild;
    readonly children: unknown;
    readonly parent: SnapshotNode | undefined;
    readonly parentPath: string;
};

type SnapshotNodeResult = {
    readonly build: SnapshotBuild;
    readonly node: SnapshotNode;
};

type ChildSnapshotsResult = {
    readonly build: SnapshotBuild;
    readonly nodes: readonly SnapshotNode[];
};

type ElementChildrenState = {
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly textContent: string;
};

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function readElementProps(element: React.ReactElement<SnapshotProps>): SnapshotProps {
    return element.props;
}

function isEmptyNode(node: unknown): boolean {
    return node === null || node === undefined || typeof node === 'boolean';
}

function isIterable(value: unknown): value is Iterable<unknown> {
    return isRecord(value) && typeof value[Symbol.iterator] === 'function';
}

function getTextContent(nodes: readonly SnapshotNode[]): string {
    return nodes
        .map(function readTextContent(node) {
            return node.textContent;
        })
        .join('');
}

function getTypeName(type: unknown): string {
    if (typeof type === 'string') {
        return type;
    }

    if (type === React.Fragment) {
        return 'Fragment';
    }

    if (typeof type === 'function') {
        const displayName: unknown = Reflect.get(type, 'displayName');

        return typeof displayName === 'string' ? displayName : type.name;
    }

    return 'Component';
}

function getElementPath(request: ElementNodeRequest, name: string): string {
    return request.parentPath === 'root' ? name : `${request.parentPath} > ${name}[${request.index}]`;
}

function rendersOwnChildren(type: unknown): boolean {
    return typeof type === 'string' || type === React.Fragment;
}

function getElementChildrenState(type: unknown, children: readonly SnapshotNode[]): ElementChildrenState {
    const renderedChildren = rendersOwnChildren(type) ? children : Object.freeze([]);

    return {
        renderedChildren,
        renderedReason: rendersOwnChildren(type) ? undefined : 'depth',
        textContent: getTextContent(renderedChildren.length > 0 ? renderedChildren : children)
    };
}

function freezePropsWithoutChildren(props: SnapshotProps): SnapshotProps {
    const publicProps: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (key !== 'children' && key !== 'key') {
            publicProps[key] = props[key];
        }
    }

    return Object.freeze(publicProps);
}

function setParent(node: SnapshotNode, parent: SnapshotNode): void {
    Object.defineProperty(node, 'parent', {
        value: parent
    });
}

function setChildrenParent(parent: SnapshotNode | undefined, children: readonly SnapshotNode[]): void {
    if (parent !== undefined) {
        for (const child of children) {
            setParent(child, parent);
        }
    }
}

function pushSnapshotNode(build: SnapshotBuild, input: SnapshotNodeInput): SnapshotNodeResult {
    const node = {
        ...input,
        id: build.nextId
    };

    return {
        build: {
            nextId: build.nextId + 1,
            nodes: Object.freeze([
                ...build.nodes,
                node
            ])
        },
        node
    };
}

function flattenReactNodes(children: unknown): readonly unknown[] {
    if (isEmptyNode(children)) {
        return Object.freeze([]);
    }

    if (Array.isArray(children)) {
        return children.flatMap(flattenReactNodes);
    }

    if (isIterable(children) && !React.isValidElement(children)) {
        return Array.from(children).flatMap(flattenReactNodes);
    }

    return Object.freeze([ children ]);
}

const snapshotOperations = {
    createChildSnapshots(request: ChildSnapshotsRequest): ChildSnapshotsResult {
        return flattenReactNodes(request.children).reduce<ChildSnapshotsResult>(
            function addChild(result, child, index) {
                const childResult = snapshotOperations.createSnapshotNode({
                    build: result.build,
                    index,
                    node: child,
                    parent: request.parent,
                    parentPath: request.parentPath
                });

                return {
                    build: childResult.build,
                    nodes: Object.freeze([
                        ...result.nodes,
                        childResult.node
                    ])
                };
            },
            {
                build: request.build,
                nodes: Object.freeze([])
            }
        );
    },
    createElementSnapshotNode(request: ElementNodeRequest): SnapshotNodeResult {
        const props = readElementProps(request.element);
        const { type } = request.element;
        const name = getTypeName(type);
        const path = getElementPath(request, name);
        const childrenResult = snapshotOperations.createChildSnapshots({
            build: request.build,
            children: props.children,
            parent: undefined,
            parentPath: path
        });
        const childrenState = getElementChildrenState(type, childrenResult.nodes);
        const result = pushSnapshotNode(childrenResult.build, {
            givenChildren: childrenResult.nodes,
            key: request.element.key ?? null,
            name,
            parent: request.parent,
            path,
            props: freezePropsWithoutChildren(props),
            renderedChildren: childrenState.renderedChildren,
            renderedReason: childrenState.renderedReason,
            textContent: childrenState.textContent,
            type
        });

        setChildrenParent(result.node, childrenResult.nodes);

        return result;
    },
    createOpaqueSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        return pushSnapshotNode(request.build, {
            givenChildren: Object.freeze([]),
            key: null,
            name: 'Opaque',
            parent: request.parent,
            path: `${request.parentPath} > Opaque[${request.index}]`,
            props: Object.freeze({ value: request.node }),
            renderedChildren: Object.freeze([]),
            renderedReason: 'unsupported',
            textContent: '',
            type: 'opaque'
        });
    },
    createSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        if (typeof request.node === 'string' || typeof request.node === 'number' || typeof request.node === 'bigint') {
            return snapshotOperations.createTextSnapshotNode(request);
        }

        if (React.isValidElement<SnapshotProps>(request.node)) {
            return snapshotOperations.createElementSnapshotNode({
                ...request,
                element: request.node
            });
        }

        return snapshotOperations.createOpaqueSnapshotNode(request);
    },
    createTextSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        return pushSnapshotNode(request.build, {
            givenChildren: Object.freeze([]),
            key: null,
            name: '#text',
            parent: request.parent,
            path: `${request.parentPath} > #text[${request.index}]`,
            props: Object.freeze({ value: request.node }),
            renderedChildren: Object.freeze([]),
            renderedReason: undefined,
            textContent: String(request.node),
            type: '#text'
        });
    }
};

export function createProbeSnapshot(element: React.ReactElement, renderCount: number): ProbeSnapshot {
    const result = snapshotOperations.createSnapshotNode({
        build: {
            nextId: 0,
            nodes: Object.freeze([])
        },
        index: 0,
        node: element,
        parent: undefined,
        parentPath: 'root'
    });

    return Object.freeze({
        nodes: result.build.nodes,
        renderCount,
        root: result.node
    });
}
