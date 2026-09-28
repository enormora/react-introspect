import React from 'react';
import {
    createIdNormalizer,
    normalizeSnapshotProps,
    normalizeSnapshotValue,
    type IntrospectionIdNormalization
} from '../normalization/introspect-id-normalization.ts';
import {
    freezePropsWithoutChildren,
    getElementChildrenState,
    getElementKind,
    getIndexedPath,
    getTextContent,
    getTypeName
} from '../shape/introspect-snapshot-shape.ts';
import { isEmptyReactNode, isIterable } from '../../values/introspect-value-kinds.ts';
import {
    type IntrospectionSnapshot,
    registerSnapshotNode,
    type SnapshotNode,
    type SnapshotProps,
    type SnapshotSourceElement,
    type SnapshotSourceNode,
    type SnapshotVisibility
} from './introspect-snapshot-contract.ts';

type SnapshotBuilder = {
    readonly normalizeIdString: (value: string) => string;
    readonly valueAncestors: WeakSet<WeakKey>;
    readonly allocateId: () => number;
    readonly push: (node: SnapshotNode) => SnapshotNode;
    readonly readNodes: () => readonly SnapshotNode[];
};

type SnapshotChildPlacement = {
    readonly build: SnapshotBuilder;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

type SnapshotNodeRequest = SnapshotChildPlacement & {
    readonly index: number | string;
    readonly node: unknown;
};

type ElementNodeRequest = SnapshotNodeRequest & {
    readonly element: React.ReactElement<SnapshotProps>;
};

type SourceElementNodeRequest = SnapshotNodeRequest & {
    readonly element: SnapshotSourceElement;
};

type ChildSnapshotsRequest = SnapshotChildPlacement & {
    readonly children: unknown;
};

type SourceChildSnapshotsRequest = SnapshotChildPlacement & {
    readonly children: readonly SnapshotSourceNode[];
};

type SourceSnapshotNodeRequest = SnapshotNodeRequest & {
    readonly node: SnapshotSourceNode;
};

type SourceElementChildrenRequest = SnapshotChildPlacement & {
    readonly element: SnapshotSourceElement;
    readonly parentId: number;
};

type SourceElementRenderedChildrenRequest = SourceElementChildrenRequest & {
    readonly givenChildren: readonly SnapshotNode[];
};

type PropsSnapshotRequest = {
    readonly build: SnapshotBuilder;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly ownerId: number;
    readonly ownerPath: string;
    readonly props: SnapshotProps;
};

function visibilityFromSource(
    inheritedVisibility: SnapshotVisibility,
    sourceVisibility: SnapshotVisibility,
    activityMode: 'hidden' | 'visible' | undefined
): SnapshotVisibility {
    if (inheritedVisibility === 'hidden' || sourceVisibility === 'hidden' || activityMode === 'hidden') {
        return 'hidden';
    }

    return 'visible';
}

function isSourceElementNode(node: SnapshotSourceNode): node is SnapshotSourceElement {
    return Object.hasOwn(node, 'type');
}

function sourceElementSharesGivenChildren(element: SnapshotSourceElement): boolean {
    return element.givenChildrenKind === 'source' && element.givenChildren === element.children;
}

function createSnapshotBuilder(normalizeIdString: (value: string) => string): SnapshotBuilder {
    const nodes: SnapshotNode[] = [];
    let nextId = 0;

    return {
        allocateId() {
            const id = nextId;

            nextId += 1;

            return id;
        },
        normalizeIdString,
        push(input) {
            const node = registerSnapshotNode(Object.freeze(input));

            nodes.push(node);

            return node;
        },
        readNodes() {
            return Object.freeze(nodes.slice());
        },
        valueAncestors: new WeakSet()
    };
}

function flattenReactNodes(children: unknown): readonly unknown[] {
    if (Array.isArray(children)) {
        return children.flatMap(flattenReactNodes);
    }

    if (isIterable(children) && !React.isValidElement(children)) {
        return Array.from(children).flatMap(flattenReactNodes);
    }

    return [ children ];
}

type SnapshotLeaf = Pick<SnapshotNode, 'kind' | 'name' | 'renderedReason' | 'textContent' | 'type'>;

function pushLeafSnapshotNode(request: SnapshotNodeRequest, leaf: SnapshotLeaf): SnapshotNode {
    return request.build.push({
        ...leaf,
        activityMode: undefined,
        caughtError: undefined,
        givenChildren: Object.freeze([]),
        id: request.build.allocateId(),
        key: null,
        parentId: request.parentId,
        path: getIndexedPath(request.parentPath, request.index, leaf.name),
        props: Object.freeze({
            value: normalizeSnapshotValue(request.node, request.build.normalizeIdString)
        }),
        renderedChildren: Object.freeze([]),
        visibility: request.inheritedVisibility
    });
}

function createEmptySnapshotNode(request: SnapshotNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'empty',
        name: '#empty',
        renderedReason: undefined,
        textContent: '',
        type: '#empty'
    });
}

function createOpaqueSnapshotNode(request: SnapshotNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'opaque',
        name: 'Opaque',
        renderedReason: 'unsupported',
        textContent: '',
        type: 'opaque'
    });
}

function createTextSnapshotNode(request: SnapshotNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'text',
        name: '#text',
        renderedReason: undefined,
        textContent: request.build.normalizeIdString(String(request.node)),
        type: '#text'
    });
}

const sourceLeafSnapshotFactories = {
    empty: createEmptySnapshotNode,
    opaque: createOpaqueSnapshotNode,
    text: createTextSnapshotNode
};

function createSiblingSnapshots<Child>(
    placement: SnapshotChildPlacement,
    children: readonly Child[],
    createNode: (request: SnapshotNodeRequest & { readonly node: Child; }) => SnapshotNode
): readonly SnapshotNode[] {
    return Object.freeze(children.map(function createSibling(child, index) {
        return createNode({ ...placement, index, node: child });
    }));
}

const snapshotOperations = {
    createChildSnapshots(request: ChildSnapshotsRequest): readonly SnapshotNode[] {
        const { children, ...placement } = request;

        return createSiblingSnapshots(placement, flattenReactNodes(children), snapshotOperations.createSnapshotNode);
    },
    createElementSnapshotNode(request: ElementNodeRequest): SnapshotNode {
        const { props } = request.element;
        const { type } = request.element;
        const id = request.build.allocateId();
        const name = getTypeName(type);
        const path = getIndexedPath(request.parentPath, request.index, name);
        const givenChildren = snapshotOperations.createChildSnapshots({
            build: request.build,
            children: props.children,
            inheritedVisibility: request.inheritedVisibility,
            parentId: id,
            parentPath: path
        });
        const childrenState = getElementChildrenState(type, givenChildren);
        const snapshotProps = snapshotOperations.createPropsSnapshot({
            build: request.build,
            inheritedVisibility: request.inheritedVisibility,
            ownerId: id,
            ownerPath: path,
            props: freezePropsWithoutChildren(props)
        });

        return request.build.push({
            activityMode: undefined,
            givenChildren,
            caughtError: undefined,
            id,
            key: request.element.key ?? null,
            kind: getElementKind(type),
            name,
            parentId: request.parentId,
            path,
            props: snapshotProps,
            renderedChildren: childrenState.renderedChildren,
            renderedReason: childrenState.renderedReason,
            textContent: childrenState.textContent,
            type,
            visibility: request.inheritedVisibility
        });
    },
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNode {
        const id = request.build.allocateId();
        const name = getTypeName(request.element.type);
        const path = getIndexedPath(request.parentPath, request.index, name);
        const visibility = visibilityFromSource(
            request.inheritedVisibility,
            request.element.visibility,
            request.element.activityMode
        );
        const childrenRequest = {
            build: request.build,
            element: request.element,
            inheritedVisibility: visibility,
            parentId: id,
            parentPath: path
        };
        const givenChildren = snapshotOperations.createSourceElementGivenChildren(childrenRequest);
        const renderedChildren = snapshotOperations.createSourceElementRenderedChildren({
            ...childrenRequest,
            givenChildren
        });
        const visibleChildren = renderedChildren.length > 0 ? renderedChildren : givenChildren;
        const snapshotProps = snapshotOperations.createPropsSnapshot({
            build: request.build,
            inheritedVisibility: visibility,
            ownerId: id,
            ownerPath: path,
            props: request.element.props
        });

        return request.build.push({
            activityMode: request.element.activityMode,
            givenChildren,
            caughtError: request.element.caughtError,
            id,
            key: request.element.key,
            kind: getElementKind(request.element.type),
            name,
            parentId: request.parentId,
            path,
            props: snapshotProps,
            renderedChildren,
            renderedReason: request.element.renderedReason,
            textContent: getTextContent(visibleChildren),
            type: request.element.type,
            visibility
        });
    },
    createPropsSnapshot(request: PropsSnapshotRequest): SnapshotProps {
        return normalizeSnapshotProps(request.props, {
            ancestors: request.build.valueAncestors,
            describeElement(element, location) {
                return snapshotOperations.createElementSnapshotNode({
                    build: request.build,
                    element,
                    index: location,
                    inheritedVisibility: request.inheritedVisibility,
                    node: element,
                    parentId: request.ownerId,
                    parentPath: request.ownerPath
                });
            },
            normalizeIdString: request.build.normalizeIdString
        });
    },
    createSourceElementGivenChildren(request: SourceElementChildrenRequest): readonly SnapshotNode[] {
        const { element, ...placement } = request;

        return element.givenChildrenKind === 'source'
            ? snapshotOperations.createSourceChildSnapshots({ ...placement, children: element.givenChildren })
            : snapshotOperations.createChildSnapshots({ ...placement, children: element.givenChildren });
    },
    createSourceElementRenderedChildren(request: SourceElementRenderedChildrenRequest): readonly SnapshotNode[] {
        if (request.element.renderedReason === 'depth') {
            return request.givenChildren;
        }

        if (request.element.renderedReason !== undefined) {
            return Object.freeze([]);
        }

        if (sourceElementSharesGivenChildren(request.element)) {
            return request.givenChildren;
        }

        return snapshotOperations.createSourceChildSnapshots({
            build: request.build,
            children: request.element.children,
            inheritedVisibility: request.inheritedVisibility,
            parentId: request.parentId,
            parentPath: request.parentPath
        });
    },
    createSnapshotNode(request: SnapshotNodeRequest): SnapshotNode {
        if (isEmptyReactNode(request.node)) {
            return createEmptySnapshotNode(request);
        }

        if (typeof request.node === 'string' || typeof request.node === 'number' || typeof request.node === 'bigint') {
            return createTextSnapshotNode(request);
        }

        if (React.isValidElement<SnapshotProps>(request.node)) {
            return snapshotOperations.createElementSnapshotNode({
                ...request,
                element: request.node
            });
        }

        return createOpaqueSnapshotNode(request);
    },
    createSourceChildSnapshots(request: SourceChildSnapshotsRequest): readonly SnapshotNode[] {
        const { children, ...placement } = request;

        return createSiblingSnapshots(placement, children, snapshotOperations.createSourceSnapshotNode);
    },
    createSourceSnapshotNode(request: SourceSnapshotNodeRequest): SnapshotNode {
        if (isSourceElementNode(request.node)) {
            return snapshotOperations.createSourceElementSnapshotNode({
                ...request,
                element: request.node
            });
        }

        return sourceLeafSnapshotFactories[request.node.kind]({
            ...request,
            inheritedVisibility: visibilityFromSource(request.inheritedVisibility, request.node.visibility, undefined),
            node: request.node.value
        });
    }
};

export function createIntrospectionSnapshotFromSource(
    children: readonly SnapshotSourceNode[],
    renderCount: number,
    idNormalization: IntrospectionIdNormalization
): IntrospectionSnapshot {
    if (children.length !== 1) {
        return createIntrospectionSnapshotFromSource(
            [
                {
                    activityMode: undefined,
                    children,
                    caughtError: undefined,
                    givenChildren: [],
                    givenChildrenKind: 'source',
                    key: null,
                    props: {},
                    renderedReason: undefined,
                    type: React.Fragment,
                    visibility: 'visible'
                }
            ],
            renderCount,
            idNormalization
        );
    }

    const build = createSnapshotBuilder(createIdNormalizer(idNormalization));
    const rootNodes = snapshotOperations.createSourceChildSnapshots({
        build,
        children,
        inheritedVisibility: 'visible',
        parentId: undefined,
        parentPath: 'root'
    });

    return Object.freeze({
        nodes: build.readNodes(),
        renderCount,
        root: rootNodes[0]
    });
}
