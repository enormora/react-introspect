import React from 'react';
import {
    createIdNormalizer,
    normalizeSnapshotProps,
    normalizeSnapshotValue,
    type IntrospectionIdNormalization,
    type SnapshotElementDescriber
} from '../normalization/introspect-id-normalization.ts';
import {
    freezePropsWithoutChildren,
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

type SnapshotNodeDescription = Pick<SnapshotNode, Exclude<keyof SnapshotNode, 'id'>>;

type SnapshotBuilder = {
    readonly normalizeIdString: (value: string) => string;
    readonly normalizeProps: (props: SnapshotProps, describeElement: SnapshotElementDescriber) => SnapshotProps;
    readonly createNode: (describe: (id: number) => SnapshotNodeDescription) => SnapshotNode;
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

type SourceElementNodeRequest = SnapshotNodeRequest & {
    readonly element: SnapshotSourceElement;
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

function sourceElementSharesGivenChildren(element: SnapshotSourceElement): boolean {
    return element.givenChildren === element.children;
}

function createSnapshotBuilder(normalizeIdString: (value: string) => string): SnapshotBuilder {
    const nodes: SnapshotNode[] = [];
    const valueAncestors = new WeakSet();
    let nextId = 0;

    return {
        createNode(describe) {
            const id = nextId;

            nextId += 1;

            const node = registerSnapshotNode(Object.freeze({ ...describe(id), id }));

            nodes.push(node);

            return node;
        },
        normalizeIdString,
        readNodes() {
            return Object.freeze(nodes.slice());
        },
        normalizeProps(props, describeElement) {
            return normalizeSnapshotProps(props, { ancestors: valueAncestors, describeElement, normalizeIdString });
        }
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

function toSourceElement(element: React.ReactElement<SnapshotProps>): SnapshotSourceElement {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- React values map to source nodes recursively
    const children = toSnapshotSourceNodes(element.props.children);

    return {
        activityMode: undefined,
        caughtError: undefined,
        children,
        givenChildren: children,
        key: element.key ?? null,
        kind: 'element',
        props: freezePropsWithoutChildren(element.props),
        renderedReason: getElementKind(element.type) === 'component' ? 'depth' : undefined,
        type: element.type,
        visibility: 'visible'
    };
}

function toSourceNode(node: unknown): SnapshotSourceNode {
    if (isEmptyReactNode(node)) {
        return { kind: 'empty', value: node, visibility: 'visible' };
    }

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
        return { kind: 'text', value: node, visibility: 'visible' };
    }

    return React.isValidElement<SnapshotProps>(node)
        ? toSourceElement(node)
        : { kind: 'opaque', value: node, visibility: 'visible' };
}

export function toSnapshotSourceNodes(children: unknown): readonly SnapshotSourceNode[] {
    return Object.freeze(flattenReactNodes(children).map(toSourceNode));
}

type SnapshotLeaf = Pick<SnapshotNode, 'kind' | 'name' | 'renderedReason' | 'textContent' | 'type'>;

function pushLeafSnapshotNode(request: SnapshotNodeRequest, leaf: SnapshotLeaf): SnapshotNode {
    return request.build.createNode(function describeLeafNode() {
        return {
            ...leaf,
            activityMode: undefined,
            caughtError: undefined,
            givenChildren: Object.freeze([]),
            key: null,
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, leaf.name),
            props: Object.freeze({
                value: normalizeSnapshotValue(request.node, request.build.normalizeIdString)
            }),
            renderedChildren: Object.freeze([]),
            visibility: request.inheritedVisibility
        };
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
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNode {
        return request.build.createNode(function describeElementNode(id) {
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

            return {
                activityMode: request.element.activityMode,
                givenChildren,
                caughtError: request.element.caughtError,
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
            };
        });
    },
    createPropsSnapshot(request: PropsSnapshotRequest): SnapshotProps {
        return request.build.normalizeProps(request.props, function describeElement(element, location) {
            return snapshotOperations.createSourceElementSnapshotNode({
                build: request.build,
                element: toSourceElement(element),
                index: location,
                inheritedVisibility: request.inheritedVisibility,
                node: element,
                parentId: request.ownerId,
                parentPath: request.ownerPath
            });
        });
    },
    createSourceElementGivenChildren(request: SourceElementChildrenRequest): readonly SnapshotNode[] {
        const { element, ...placement } = request;

        return snapshotOperations.createSourceChildSnapshots({ ...placement, children: element.givenChildren });
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
    createSourceChildSnapshots(request: SourceChildSnapshotsRequest): readonly SnapshotNode[] {
        const { children, ...placement } = request;

        return createSiblingSnapshots(placement, children, snapshotOperations.createSourceSnapshotNode);
    },
    createSourceSnapshotNode(request: SourceSnapshotNodeRequest): SnapshotNode {
        if (request.node.kind === 'element') {
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
                    kind: 'element',
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
