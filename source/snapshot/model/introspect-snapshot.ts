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
    getElementKind,
    getIndexedPath,
    getTextContent,
    getTypeName
} from '../shape/introspect-snapshot-shape.ts';
import {
    type IntrospectionSnapshot,
    registerSnapshotNode,
    type SnapshotNode,
    type SnapshotNotRendered,
    type SnapshotPlacement,
    type SnapshotProps,
    type SnapshotRender,
    type SnapshotSourceElement,
    type SnapshotSourceNode,
    type SnapshotSourceOutput,
    type SnapshotVisibility
} from './introspect-snapshot-contract.ts';
import { toSourceElement } from './introspect-snapshot-source-mapping.ts';

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
};

type PropsSnapshotRequest = SnapshotChildPlacement & {
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

function placementFromSource(hiddenBy: IntrospectionHiddenReason | undefined): SnapshotPlacement {
    return hiddenBy === undefined ? { visibility: 'visible' } : { hiddenBy, visibility: 'hidden' };
}

const notRenderedFromSource: Readonly<
    Record<IntrospectionNotRenderedReason, (hiddenBy: IntrospectionHiddenReason | undefined) => SnapshotNotRendered>
> = {
    depth(hiddenBy) {
        return { ...placementFromSource(hiddenBy), reason: 'depth', status: 'notRendered' };
    },
    unsupported() {
        return { reason: 'unsupported', status: 'notRendered' };
    }
};

function readNotRenderedReason(output: SnapshotSourceOutput): IntrospectionNotRenderedReason | undefined {
    return output.status === 'notRendered' ? output.reason : undefined;
}

function renderFromSource(
    renderedReason: IntrospectionNotRenderedReason | undefined,
    hiddenBy: IntrospectionHiddenReason | undefined
): SnapshotRender {
    return renderedReason === undefined
        ? { ...placementFromSource(hiddenBy), status: 'rendered' }
        : notRenderedFromSource[renderedReason](hiddenBy);
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

type SnapshotLeafKind = Exclude<SnapshotSourceNode['kind'], 'element'>;

type SnapshotLeafDescription = {
    readonly name: string;
    readonly readTextContent: (request: LeafNodeRequest) => string;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: string;
};

function readNoTextContent(): string {
    return '';
}

const snapshotLeafDescriptions: Readonly<Record<SnapshotLeafKind, SnapshotLeafDescription>> = {
    empty: {
        name: '#empty',
        readTextContent: readNoTextContent,
        renderedReason: undefined,
        type: '#empty'
    },
    opaque: {
        name: 'Opaque',
        readTextContent: readNoTextContent,
        renderedReason: 'unsupported',
        type: 'opaque'
    },
    text: {
        name: '#text',
        readTextContent(request) {
            return request.build.normalizeIdString(String(request.value));
        },
        renderedReason: undefined,
        type: '#text'
    }
};

function createLeafSnapshotNode(kind: SnapshotLeafKind, request: LeafNodeRequest): SnapshotNode {
    const description = snapshotLeafDescriptions[kind];

    return request.build.createNode(function describeLeafNode() {
        return {
            activityMode: undefined,
            caughtError: undefined,
            givenChildren: Object.freeze([]),
            key: null,
            kind,
            name: description.name,
            parentId: request.parentId,
            path: getIndexedPath(request.parentPath, request.index, description.name),
            props: Object.freeze({
                value: normalizeSnapshotValue(request.value, request.build.normalizeIdString)
            }),
            render: renderFromSource(description.renderedReason, request.inheritedHiddenBy),
            renderedChildren: Object.freeze([]),
            textContent: description.readTextContent(request),
            type: description.type
        };
    });
}

const snapshotOperations = {
    createSourceElementSnapshotNode(request: SourceElementNodeRequest): SnapshotNode {
        return request.build.createNode(function describeElementNode(id) {
            const name = getTypeName(
                request.element.type,
                request.element.output.status === 'rendered' ? 'executed' : 'unexecuted'
            );
            const path = getIndexedPath(request.parentPath, request.index, name);
            const hiddenBy = hiddenByFromSource(
                request.inheritedHiddenBy,
                request.element.hostVisibility,
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
                ...childPlacement,
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
                render: renderFromSource(readNotRenderedReason(request.element.output), hiddenBy),
                renderedChildren,
                textContent: getTextContent(visibleChildren),
                type: request.element.type
            };
        });
    },
    createPropsSnapshot(request: PropsSnapshotRequest): SnapshotProps {
        const { props, ...placement } = request;

        return placement.build.normalizeProps(props, function describeElement(element, location) {
            return snapshotOperations.createSourceElementSnapshotNode({
                ...placement,
                element: toSourceElement(element),
                index: location
            });
        });
    },
    createSourceElementRenderedChildren(request: SourceElementRenderedChildrenRequest): readonly SnapshotNode[] {
        const { element, givenChildren, ...placement } = request;
        const { output } = element;

        if (output.status === 'notRendered') {
            return output.reason === 'depth' ? givenChildren : Object.freeze([]);
        }

        if (output.children === 'given') {
            return givenChildren;
        }

        return snapshotOperations.createSourceChildSnapshots({ ...placement, children: output.children });
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

        return createLeafSnapshotNode(node.kind, {
            ...placement,
            inheritedHiddenBy: hiddenByFromSource(placement.inheritedHiddenBy, node.hostVisibility, undefined),
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
                    caughtError: undefined,
                    givenChildren: [],
                    kind: 'element',
                    key: null,
                    props: {},
                    output: { children, status: 'rendered' },
                    type: React.Fragment,
                    hostVisibility: 'visible'
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
