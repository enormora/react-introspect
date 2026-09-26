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
    getSourceElementKind,
    getTextContent,
    getTypeName
} from '../shape/introspect-snapshot-shape.ts';
import { isIterable } from '../../values/introspect-value-kinds.ts';
import {
    type ChildSnapshotsRequest,
    type ChildSnapshotsResult,
    type ElementNodeRequest,
    type IntrospectionSnapshot,
    type NodeIdAllocation,
    type PropsSnapshotRequest,
    type PropsSnapshotResult,
    registerSnapshotNode,
    type SnapshotBuild,
    type SnapshotChildPlacement,
    type SnapshotNode,
    type SnapshotNodeRequest,
    type SnapshotNodeResult,
    type SnapshotProps,
    type SnapshotSourceElement,
    type SnapshotSourceNode,
    type SnapshotVisibility,
    type SourceChildSnapshotsRequest,
    type SourceElementChildrenRequest,
    type SourceElementNodeRequest,
    type SourceElementRenderedChildrenRequest,
    type SourceSnapshotNodeRequest
} from './introspect-snapshot-contract.ts';

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

function readElementProps(element: React.ReactElement<SnapshotProps>): SnapshotProps {
    return element.props;
}

function isEmptyNode(node: unknown): boolean {
    return node === null || node === undefined || typeof node === 'boolean';
}

function isSourceElementNode(node: SnapshotSourceNode): node is SnapshotSourceElement {
    return Object.hasOwn(node, 'type');
}

function sourceElementSharesGivenChildren(element: SnapshotSourceElement): boolean {
    return element.givenChildrenKind === 'source' && element.givenChildren === element.children;
}

function allocateNodeId(build: SnapshotBuild): NodeIdAllocation {
    return {
        build: {
            nextId: build.nextId + 1,
            nodes: build.nodes,
            normalizeIdString: build.normalizeIdString,
            valueAncestors: build.valueAncestors
        },
        id: build.nextId
    };
}

function pushSnapshotNode(build: SnapshotBuild, input: SnapshotNode): SnapshotNodeResult {
    const node = registerSnapshotNode(Object.freeze(input));

    return {
        build: {
            nextId: build.nextId,
            normalizeIdString: build.normalizeIdString,
            nodes: Object.freeze([
                ...build.nodes,
                node
            ]),
            valueAncestors: build.valueAncestors
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

type SnapshotLeaf = Pick<SnapshotNode, 'kind' | 'name' | 'renderedReason' | 'textContent' | 'type'>;

function pushLeafSnapshotNode(request: SnapshotNodeRequest, leaf: SnapshotLeaf): SnapshotNodeResult {
    const idAllocation = allocateNodeId(request.build);

    return pushSnapshotNode(idAllocation.build, {
        ...leaf,
        activityMode: undefined,
        error: undefined,
        givenChildren: Object.freeze([]),
        id: idAllocation.id,
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

function createEmptySnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
    return pushLeafSnapshotNode(request, {
        kind: 'empty',
        name: '#empty',
        renderedReason: undefined,
        textContent: '',
        type: '#empty'
    });
}

function createOpaqueSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
    return pushLeafSnapshotNode(request, {
        kind: 'opaque',
        name: 'Opaque',
        renderedReason: 'unsupported',
        textContent: '',
        type: 'opaque'
    });
}

function createTextSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
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
    createNode: (request: SnapshotNodeRequest & { readonly node: Child; }) => SnapshotNodeResult
): ChildSnapshotsResult {
    return children.reduce<ChildSnapshotsResult>(
        function addChild(result, child, index) {
            const childResult = createNode({ ...placement, build: result.build, index, node: child });

            return {
                build: childResult.build,
                nodes: Object.freeze([
                    ...result.nodes,
                    childResult.node
                ])
            };
        },
        {
            build: placement.build,
            nodes: Object.freeze([])
        }
    );
}

const snapshotOperations = {
    createChildSnapshots(request: ChildSnapshotsRequest): ChildSnapshotsResult {
        const { children, ...placement } = request;

        return createSiblingSnapshots(placement, flattenReactNodes(children), snapshotOperations.createSnapshotNode);
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
            idNormalization: request.idNormalization,
            inheritedVisibility: request.inheritedVisibility,
            parentId: idAllocation.id,
            parentPath: path
        });
        const childrenState = getElementChildrenState(type, childrenResult.nodes);
        const propsResult = snapshotOperations.createPropsSnapshot({
            build: childrenResult.build,
            idNormalization: request.idNormalization,
            inheritedVisibility: request.inheritedVisibility,
            ownerId: idAllocation.id,
            ownerPath: path,
            props: freezePropsWithoutChildren(props)
        });
        const result = pushSnapshotNode(propsResult.build, {
            activityMode: undefined,
            givenChildren: childrenResult.nodes,
            error: undefined,
            id: idAllocation.id,
            key: request.element.key ?? null,
            kind: getElementKind(type),
            name,
            parentId: request.parentId,
            path,
            props: propsResult.props,
            renderedChildren: childrenState.renderedChildren,
            renderedReason: childrenState.renderedReason,
            textContent: childrenState.textContent,
            type,
            visibility: request.inheritedVisibility
        });

        return result;
    },
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNodeResult {
        const idAllocation = allocateNodeId(request.build);
        const name = getTypeName(request.element.type);
        const path = getIndexedPath(request.parentPath, request.index, name);
        const visibility = visibilityFromSource(
            request.inheritedVisibility,
            request.element.visibility,
            request.element.activityMode
        );
        const childrenRequest = {
            build: idAllocation.build,
            element: request.element,
            idNormalization: request.idNormalization,
            inheritedVisibility: visibility,
            parentId: idAllocation.id,
            parentPath: path
        };
        const givenChildrenResult = snapshotOperations.createSourceElementGivenChildren(childrenRequest);
        const renderedChildrenResult = snapshotOperations.createSourceElementRenderedChildren({
            ...childrenRequest,
            givenChildrenResult
        });
        const visibleChildren = renderedChildrenResult.nodes.length > 0
            ? renderedChildrenResult.nodes
            : givenChildrenResult.nodes;
        const propsResult = snapshotOperations.createPropsSnapshot({
            build: renderedChildrenResult.build,
            idNormalization: request.idNormalization,
            inheritedVisibility: visibility,
            ownerId: idAllocation.id,
            ownerPath: path,
            props: request.element.props
        });

        return pushSnapshotNode(propsResult.build, {
            activityMode: request.element.activityMode,
            givenChildren: givenChildrenResult.nodes,
            error: request.element.error,
            id: idAllocation.id,
            key: request.element.key,
            kind: getSourceElementKind(request.element),
            name,
            parentId: request.parentId,
            path,
            props: propsResult.props,
            renderedChildren: renderedChildrenResult.nodes,
            renderedReason: request.element.renderedReason,
            textContent: getTextContent(visibleChildren),
            type: request.element.type,
            visibility
        });
    },
    createPropsSnapshot(request: PropsSnapshotRequest): PropsSnapshotResult {
        let currentBuild = request.build;
        const props = normalizeSnapshotProps(request.props, {
            ancestors: request.build.valueAncestors,
            describeElement(element, location) {
                const elementResult = snapshotOperations.createElementSnapshotNode({
                    build: currentBuild,
                    element,
                    idNormalization: request.idNormalization,
                    index: location,
                    inheritedVisibility: request.inheritedVisibility,
                    node: element,
                    parentId: request.ownerId,
                    parentPath: request.ownerPath
                });

                currentBuild = elementResult.build;

                return elementResult.node;
            },
            normalizeIdString: request.build.normalizeIdString
        });

        return { build: currentBuild, props };
    },
    createSourceElementGivenChildren(request: SourceElementChildrenRequest): ChildSnapshotsResult {
        const { element, ...placement } = request;

        return element.givenChildrenKind === 'source'
            ? snapshotOperations.createSourceChildSnapshots({ ...placement, children: element.givenChildren })
            : snapshotOperations.createChildSnapshots({ ...placement, children: element.givenChildren });
    },
    createSourceElementRenderedChildren(request: SourceElementRenderedChildrenRequest): ChildSnapshotsResult {
        if (request.element.renderedReason === 'depth') {
            return request.givenChildrenResult;
        }

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
            idNormalization: request.idNormalization,
            inheritedVisibility: request.inheritedVisibility,
            parentId: request.parentId,
            parentPath: request.parentPath
        });
    },
    createSnapshotNode(request: SnapshotNodeRequest): SnapshotNodeResult {
        if (isEmptyNode(request.node)) {
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
    createSourceChildSnapshots(request: SourceChildSnapshotsRequest): ChildSnapshotsResult {
        const { children, ...placement } = request;

        return createSiblingSnapshots(placement, children, snapshotOperations.createSourceSnapshotNode);
    },
    createSourceSnapshotNode(request: SourceSnapshotNodeRequest): SnapshotNodeResult {
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
    idNormalization: IntrospectionIdNormalization = { generator: undefined, prefix: '' }
): IntrospectionSnapshot {
    if (children.length !== 1) {
        return createIntrospectionSnapshotFromSource(
            [
                {
                    activityMode: undefined,
                    children,
                    error: undefined,
                    givenChildren: [],
                    givenChildrenKind: 'source',
                    key: null,
                    props: Object.freeze({}),
                    renderedReason: undefined,
                    type: React.Fragment,
                    visibility: 'visible'
                }
            ],
            renderCount,
            idNormalization
        );
    }

    const result = snapshotOperations.createSourceChildSnapshots({
        build: {
            nextId: 0,
            nodes: Object.freeze([]),
            normalizeIdString: createIdNormalizer(idNormalization),
            valueAncestors: new WeakSet()
        },
        children,
        idNormalization,
        inheritedVisibility: 'visible',
        parentId: undefined,
        parentPath: 'root'
    });

    return Object.freeze({
        nodes: result.build.nodes,
        renderCount,
        root: result.nodes[0]
    });
}
