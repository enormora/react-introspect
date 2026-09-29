import React from 'react';
import type {
    IntrospectionHiddenReason,
    IntrospectionNotRenderedReason
} from '../../public/introspect-public-types.ts';
import {
    createIdNormalizer,
    normalizeSnapshotProps,
    normalizeSnapshotValue,
    type IntrospectionIdNormalization,
    type SnapshotElementDescriber
} from '../normalization/introspect-id-normalization.ts';
import {
    freezePublicElementProps,
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
    type SnapshotNotRendered,
    type SnapshotProps,
    type SnapshotRender,
    type SnapshotRendered,
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
    readonly inheritedHiddenBy: IntrospectionHiddenReason | undefined;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

type SnapshotSiblingPlacement = SnapshotChildPlacement & {
    readonly index: number | string;
};

type LeafNodeRequest = SnapshotSiblingPlacement & {
    readonly value: unknown;
};

type SourceElementNodeRequest = SnapshotSiblingPlacement & {
    readonly element: SnapshotSourceElement;
};

type SourceChildSnapshotsRequest = SnapshotChildPlacement & {
    readonly children: readonly SnapshotSourceNode[];
};

type SourceSnapshotNodeRequest = SnapshotSiblingPlacement & {
    readonly node: SnapshotSourceNode;
};

type SourceElementRenderedChildrenRequest = SnapshotChildPlacement & {
    readonly element: SnapshotSourceElement;
    readonly givenChildren: readonly SnapshotNode[];
    readonly parentId: number;
};

type PropsSnapshotRequest = {
    readonly build: SnapshotBuilder;
    readonly inheritedHiddenBy: IntrospectionHiddenReason | undefined;
    readonly ownerId: number;
    readonly ownerPath: string;
    readonly props: SnapshotProps;
};

function hiddenByFromSource(
    inheritedHiddenBy: IntrospectionHiddenReason | undefined,
    sourceVisibility: SnapshotVisibility,
    activityMode: 'hidden' | 'visible' | undefined
): IntrospectionHiddenReason | undefined {
    if (inheritedHiddenBy !== undefined) {
        return inheritedHiddenBy;
    }

    if (sourceVisibility === 'hidden') {
        return 'suspended';
    }

    return activityMode === 'hidden' ? 'activity' : undefined;
}

function renderedFromSource(hiddenBy: IntrospectionHiddenReason | undefined): SnapshotRendered {
    return hiddenBy === undefined
        ? { status: 'rendered', visibility: 'visible' }
        : { hiddenBy, status: 'rendered', visibility: 'hidden' };
}

const notRenderedFromSource: Readonly<
    Record<IntrospectionNotRenderedReason, (hiddenBy: IntrospectionHiddenReason | undefined) => SnapshotNotRendered>
> = {
    depth(hiddenBy) {
        return { reason: 'depth', status: 'notRendered', visibility: renderedFromSource(hiddenBy).visibility };
    },
    unsupported() {
        return { reason: 'unsupported', status: 'notRendered' };
    }
};

function renderFromSource(
    renderedReason: IntrospectionNotRenderedReason | undefined,
    hiddenBy: IntrospectionHiddenReason | undefined
): SnapshotRender {
    return renderedReason === undefined
        ? renderedFromSource(hiddenBy)
        : notRenderedFromSource[renderedReason](hiddenBy);
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
        props: freezePublicElementProps(element.props),
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

type SnapshotLeaf = Pick<SnapshotNode, 'kind' | 'name' | 'textContent' | 'type'> & {
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
};

function pushLeafSnapshotNode(request: LeafNodeRequest, leaf: SnapshotLeaf): SnapshotNode {
    const { renderedReason, ...leafShape } = leaf;

    return request.build.createNode(function describeLeafNode() {
        return {
            ...leafShape,
            activityMode: undefined,
            caughtError: undefined,
            givenChildren: Object.freeze([]),
            key: null,
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, leaf.name),
            props: Object.freeze({
                value: normalizeSnapshotValue(request.value, request.build.normalizeIdString)
            }),
            render: renderFromSource(renderedReason, request.inheritedHiddenBy),
            renderedChildren: Object.freeze([])
        };
    });
}

function createEmptySnapshotNode(request: LeafNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'empty',
        name: '#empty',
        renderedReason: undefined,
        textContent: '',
        type: '#empty'
    });
}

function createOpaqueSnapshotNode(request: LeafNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'opaque',
        name: 'Opaque',
        renderedReason: 'unsupported',
        textContent: '',
        type: 'opaque'
    });
}

function createTextSnapshotNode(request: LeafNodeRequest): SnapshotNode {
    return pushLeafSnapshotNode(request, {
        kind: 'text',
        name: '#text',
        renderedReason: undefined,
        textContent: request.build.normalizeIdString(String(request.value)),
        type: '#text'
    });
}

const sourceLeafSnapshotFactories = {
    empty: createEmptySnapshotNode,
    opaque: createOpaqueSnapshotNode,
    text: createTextSnapshotNode
};

const snapshotOperations = {
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNode {
        return request.build.createNode(function describeElementNode(id) {
            const name = getTypeName(request.element.type);
            const path = getIndexedPath(request.parentPath, request.index, name);
            const hiddenBy = hiddenByFromSource(
                request.inheritedHiddenBy,
                request.element.visibility,
                request.element.activityMode
            );
            const childPlacement = {
                build: request.build,
                inheritedHiddenBy: hiddenBy,
                parentId: id,
                parentPath: path
            };
            const givenChildren = snapshotOperations.createSourceChildSnapshots({
                ...childPlacement,
                children: request.element.givenChildren
            });
            const renderedChildren = snapshotOperations.createSourceElementRenderedChildren({
                ...childPlacement,
                element: request.element,
                givenChildren
            });
            const visibleChildren = renderedChildren.length > 0 ? renderedChildren : givenChildren;
            const snapshotProps = snapshotOperations.createPropsSnapshot({
                build: request.build,
                inheritedHiddenBy: hiddenBy,
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
                render: renderFromSource(request.element.renderedReason, hiddenBy),
                renderedChildren,
                textContent: getTextContent(visibleChildren),
                type: request.element.type
            };
        });
    },
    createPropsSnapshot(request: PropsSnapshotRequest): SnapshotProps {
        return request.build.normalizeProps(request.props, function describeElement(element, location) {
            return snapshotOperations.createSourceElementSnapshotNode({
                build: request.build,
                element: toSourceElement(element),
                index: location,
                inheritedHiddenBy: request.inheritedHiddenBy,
                parentId: request.ownerId,
                parentPath: request.ownerPath
            });
        });
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
            inheritedHiddenBy: request.inheritedHiddenBy,
            parentId: request.parentId,
            parentPath: request.parentPath
        });
    },
    createSourceChildSnapshots(request: SourceChildSnapshotsRequest): readonly SnapshotNode[] {
        const { children, ...placement } = request;

        return Object.freeze(children.map(function createSibling(child, index) {
            return snapshotOperations.createSourceSnapshotNode({ ...placement, index, node: child });
        }));
    },
    createSourceSnapshotNode(request: SourceSnapshotNodeRequest): SnapshotNode {
        const { node, ...placement } = request;

        if (node.kind === 'element') {
            return snapshotOperations.createSourceElementSnapshotNode({ ...placement, element: node });
        }

        return sourceLeafSnapshotFactories[node.kind]({
            ...placement,
            inheritedHiddenBy: hiddenByFromSource(placement.inheritedHiddenBy, node.visibility, undefined),
            value: node.value
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
        inheritedHiddenBy: undefined,
        parentId: undefined,
        parentPath: 'root'
    });

    return Object.freeze({
        nodes: build.readNodes(),
        renderCount,
        root: rootNodes[0]
    });
}
