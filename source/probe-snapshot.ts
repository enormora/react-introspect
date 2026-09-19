import React from 'react';
import type { ProbeNotRenderedReason } from './probe-public-types.ts';

export type ProbeSnapshot = {
    readonly nodes: readonly SnapshotNode[];
    readonly renderCount: number;
    readonly root: SnapshotNode | undefined;
};

export type SnapshotProps = Readonly<Record<PropertyKey, unknown>>;

type SnapshotNodeKind = 'component' | 'empty' | 'fragment' | 'host' | 'opaque' | 'text';

type SnapshotSourceVisibleNode = SnapshotSourceElement | SnapshotSourceEmpty;

export type SnapshotSourceNode = SnapshotSourceOpaque | SnapshotSourceText | SnapshotSourceVisibleNode;

type SnapshotSourceElementBase = {
    readonly children: readonly SnapshotSourceNode[];
    readonly key: string | null;
    readonly props: SnapshotProps;
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly type: unknown;
};

type SnapshotSourceReactElement = SnapshotSourceElementBase & {
    readonly givenChildren: unknown;
    readonly givenChildrenKind: 'react';
};

type SnapshotSourceOwnedElement = SnapshotSourceElementBase & {
    readonly givenChildren: readonly SnapshotSourceNode[];
    readonly givenChildrenKind: 'source';
};

type SnapshotSourceElement = SnapshotSourceOwnedElement | SnapshotSourceReactElement;

type SnapshotSourceEmpty = { readonly kind: 'empty'; readonly value: unknown; };

type SnapshotSourceOpaque = { readonly kind: 'opaque'; readonly value: unknown; };

type SnapshotSourceText = { readonly kind: 'text'; readonly value: string; };

export type SnapshotNode = {
    readonly givenChildren: readonly SnapshotNode[];
    readonly id: number;
    readonly key: string | null;
    readonly kind: SnapshotNodeKind;
    readonly name: string;
    readonly parentId: number | undefined;
    readonly path: string;
    readonly props: SnapshotProps;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly textContent: string;
    readonly type: unknown;
};

type SnapshotBuild = { readonly nextId: number; readonly nodes: readonly SnapshotNode[]; };

type NodeIdAllocation = { readonly build: SnapshotBuild; readonly id: number; };

type SnapshotNodeInput = {
    readonly givenChildren: readonly SnapshotNode[];
    readonly id: number;
    readonly key: string | null;
    readonly kind: SnapshotNodeKind;
    readonly name: string;
    readonly parentId: number | undefined;
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
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

type ElementNodeRequest = SnapshotNodeRequest & { readonly element: React.ReactElement<SnapshotProps>; };

type SourceElementNodeRequest = SnapshotNodeRequest & { readonly element: SnapshotSourceElement; };

type ChildSnapshotsRequest = {
    readonly build: SnapshotBuild;
    readonly children: unknown;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

type SourceChildSnapshotsRequest = {
    readonly build: SnapshotBuild;
    readonly children: readonly SnapshotSourceNode[];
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

type SourceSnapshotNodeRequest = SnapshotNodeRequest & { readonly node: SnapshotSourceNode; };

type SourceElementChildrenRequest = {
    readonly build: SnapshotBuild;
    readonly element: SnapshotSourceElement;
    readonly parentId: number;
    readonly parentPath: string;
};

type SourceElementRenderedChildrenRequest = SourceElementChildrenRequest & {
    readonly givenChildrenResult: ChildSnapshotsResult;
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

function isSourceElementNode(node: SnapshotSourceNode): node is SnapshotSourceElement {
    return Object.hasOwn(node, 'type');
}

function sourceElementSharesGivenChildren(element: SnapshotSourceElement): boolean {
    return element.givenChildrenKind === 'source' && element.givenChildren === element.children;
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

function getIndexedPath(parentPath: string, index: number, name: string): string {
    return parentPath === 'root' ? name : `${parentPath} > ${name}[${index}]`;
}

function rendersOwnChildren(type: unknown): boolean {
    return typeof type === 'string' || type === React.Fragment;
}

function getElementKind(type: unknown): SnapshotNodeKind {
    if (typeof type === 'string') {
        return 'host';
    }

    if (type === React.Fragment) {
        return 'fragment';
    }

    return 'component';
}

function getSourceElementKind(element: SnapshotSourceElement): SnapshotNodeKind {
    if (typeof element.type === 'string') {
        return 'host';
    }

    if (element.type === React.Fragment) {
        return 'fragment';
    }

    return 'component';
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

function allocateNodeId(build: SnapshotBuild): NodeIdAllocation {
    return {
        build: {
            nextId: build.nextId + 1,
            nodes: build.nodes
        },
        id: build.nextId
    };
}

function pushSnapshotNode(build: SnapshotBuild, input: SnapshotNodeInput): SnapshotNodeResult {
    const node = Object.freeze(input);

    return {
        build: {
            nextId: build.nextId,
            nodes: Object.freeze([
                ...build.nodes,
                node
            ])
        },
        node
    };
}

function flattenReactNodes(children: unknown): readonly unknown[] {
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
                    parentId: request.parentId,
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
        const idAllocation = allocateNodeId(request.build);
        const name = getTypeName(type);
        const path = getIndexedPath(request.parentPath, request.index, name);
        const childrenResult = snapshotOperations.createChildSnapshots({
            build: idAllocation.build,
            children: props.children,
            parentId: idAllocation.id,
            parentPath: path
        });
        const childrenState = getElementChildrenState(type, childrenResult.nodes);
        const result = pushSnapshotNode(childrenResult.build, {
            givenChildren: childrenResult.nodes,
            id: idAllocation.id,
            key: request.element.key ?? null,
            kind: getElementKind(type),
            name,
            parentId: request.parentId,
            path,
            props: freezePropsWithoutChildren(props),
            renderedChildren: childrenState.renderedChildren,
            renderedReason: childrenState.renderedReason,
            textContent: childrenState.textContent,
            type
        });

        return result;
    },
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNodeResult {
        const idAllocation = allocateNodeId(request.build);
        const name = getTypeName(request.element.type);
        const path = getIndexedPath(request.parentPath, request.index, name);
        const childrenRequest = {
            build: idAllocation.build,
            element: request.element,
            parentId: idAllocation.id,
            parentPath: path
        };
        const givenChildrenResult = snapshotOperations.createSourceElementGivenChildren(childrenRequest);
        const renderedChildrenResult = snapshotOperations.createSourceElementRenderedChildren({
            ...childrenRequest,
            givenChildrenResult
        });
        const renderedChildren = request.element.renderedReason === undefined
            ? renderedChildrenResult.nodes
            : Object.freeze([]);
        const visibleChildren = renderedChildren.length > 0 ? renderedChildren : givenChildrenResult.nodes;

        return pushSnapshotNode(renderedChildrenResult.build, {
            givenChildren: givenChildrenResult.nodes,
            id: idAllocation.id,
            key: request.element.key,
            kind: getSourceElementKind(request.element),
            name,
            parentId: request.parentId,
            path,
            props: request.element.props,
            renderedChildren,
            renderedReason: request.element.renderedReason,
            textContent: getTextContent(visibleChildren),
            type: request.element.type
        });
    },
    createSourceElementGivenChildren(request: SourceElementChildrenRequest): ChildSnapshotsResult {
        return request.element.givenChildrenKind === 'source'
            ? snapshotOperations.createSourceChildSnapshots({
                build: request.build,
                children: request.element.givenChildren,
                parentId: request.parentId,
                parentPath: request.parentPath
            })
            : snapshotOperations.createChildSnapshots({
                build: request.build,
                children: request.element.givenChildren,
                parentId: request.parentId,
                parentPath: request.parentPath
            });
    },
    createSourceElementRenderedChildren(request: SourceElementRenderedChildrenRequest): ChildSnapshotsResult {
        if (request.element.renderedReason !== undefined) {
            return {
                build: request.givenChildrenResult.build,
                nodes: Object.freeze([])
            };
        }

        if (sourceElementSharesGivenChildren(request.element)) {
            return request.givenChildrenResult;
        }

        return snapshotOperations.createSourceChildSnapshots({
            build: request.givenChildrenResult.build,
            children: request.element.children,
            parentId: request.parentId,
            parentPath: request.parentPath
        });
    },
    createEmptySnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        const idAllocation = allocateNodeId(request.build);

        return pushSnapshotNode(idAllocation.build, {
            givenChildren: Object.freeze([]),
            id: idAllocation.id,
            key: null,
            kind: 'empty',
            name: '#empty',
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, '#empty'),
            props: Object.freeze({ value: request.node }),
            renderedChildren: Object.freeze([]),
            renderedReason: undefined,
            textContent: '',
            type: '#empty'
        });
    },
    createOpaqueSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        const idAllocation = allocateNodeId(request.build);

        return pushSnapshotNode(idAllocation.build, {
            givenChildren: Object.freeze([]),
            id: idAllocation.id,
            key: null,
            kind: 'opaque',
            name: 'Opaque',
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, 'Opaque'),
            props: Object.freeze({ value: request.node }),
            renderedChildren: Object.freeze([]),
            renderedReason: 'unsupported',
            textContent: '',
            type: 'opaque'
        });
    },
    createSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        if (isEmptyNode(request.node)) {
            return snapshotOperations.createEmptySnapshotNode(request);
        }

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
    createSourceChildSnapshots(request: SourceChildSnapshotsRequest): ChildSnapshotsResult {
        return request.children.reduce<ChildSnapshotsResult>(
            function addChild(result, child, index) {
                const childResult = snapshotOperations.createSourceSnapshotNode({
                    build: result.build,
                    index,
                    node: child,
                    parentId: request.parentId,
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
    createSourceSnapshotNode(request: SourceSnapshotNodeRequest): SnapshotNodeResult {
        if (isSourceElementNode(request.node)) {
            return snapshotOperations.createSourceElementSnapshotNode({
                ...request,
                element: request.node
            });
        }

        if (request.node.kind === 'text') {
            return snapshotOperations.createTextSnapshotNode({
                ...request,
                node: request.node.value
            });
        }

        if (request.node.kind === 'empty') {
            return snapshotOperations.createEmptySnapshotNode({
                ...request,
                node: request.node.value
            });
        }

        return snapshotOperations.createOpaqueSnapshotNode({
            ...request,
            node: request.node.value
        });
    },
    createTextSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        const idAllocation = allocateNodeId(request.build);

        return pushSnapshotNode(idAllocation.build, {
            givenChildren: Object.freeze([]),
            id: idAllocation.id,
            key: null,
            kind: 'text',
            name: '#text',
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, '#text'),
            props: Object.freeze({ value: request.node }),
            renderedChildren: Object.freeze([]),
            renderedReason: undefined,
            textContent: String(request.node),
            type: '#text'
        });
    }
};

export function createEmptyProbeSnapshot(renderCount: number): ProbeSnapshot {
    return Object.freeze({
        nodes: Object.freeze([]),
        renderCount,
        root: undefined
    });
}

export function createProbeSnapshotFromSource(
    children: readonly SnapshotSourceNode[],
    renderCount: number
): ProbeSnapshot {
    if (children.length !== 1) {
        return createProbeSnapshotFromSource([
            {
                children,
                givenChildren: [],
                givenChildrenKind: 'source',
                key: null,
                props: Object.freeze({}),
                renderedReason: undefined,
                type: React.Fragment
            }
        ], renderCount);
    }

    const result = snapshotOperations.createSourceChildSnapshots({
        build: {
            nextId: 0,
            nodes: Object.freeze([])
        },
        children,
        parentId: undefined,
        parentPath: 'root'
    });

    return Object.freeze({
        nodes: result.build.nodes,
        renderCount,
        root: result.nodes[0]
    });
}
