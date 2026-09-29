import React from 'react';
import { freezePublicElementProps, getElementKind } from '../shape/introspect-snapshot-shape.ts';
import { isEmptyReactNode, isIterable } from '../../values/introspect-value-kinds.ts';
import type { IntrospectionNotRenderedReason } from '../../public/introspect-public-types.ts';
import type {
    SnapshotProps,
    SnapshotSourceElement,
    SnapshotSourceNode,
    SnapshotSourceOutput
} from './introspect-snapshot-contract.ts';

function flattenReactNodes(children: unknown): readonly unknown[] {
    if (Array.isArray(children)) {
        return children.flatMap(flattenReactNodes);
    }

    if (isIterable(children) && !React.isValidElement(children)) {
        return Array.from(children).flatMap(flattenReactNodes);
    }

    return [ children ];
}

export function toSourceElement(element: React.ReactElement<SnapshotProps>): SnapshotSourceElement {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- React values map to source nodes recursively
    const children = toSnapshotSourceNodes(element.props.children);

    return {
        activityMode: undefined,
        caughtError: undefined,
        givenChildren: children,
        key: element.key ?? null,
        kind: 'element',
        props: freezePublicElementProps(element.props),
        output: getElementKind(element.type) === 'component'
            ? { reason: 'depth', status: 'notRendered' }
            : { children: 'given', status: 'rendered' },
        type: element.type,
        hostVisibility: 'visible'
    };
}

function toSourceNode(node: unknown): SnapshotSourceNode {
    if (isEmptyReactNode(node)) {
        return { kind: 'empty', value: node, hostVisibility: 'visible' };
    }

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
        return { kind: 'text', value: node, hostVisibility: 'visible' };
    }

    return React.isValidElement<SnapshotProps>(node)
        ? toSourceElement(node)
        : { kind: 'opaque', value: node, hostVisibility: 'visible' };
}

export function toSnapshotSourceNodes(children: unknown): readonly SnapshotSourceNode[] {
    return Object.freeze(flattenReactNodes(children).map(toSourceNode));
}

export function toSourceOutput(
    renderedReason: IntrospectionNotRenderedReason | undefined,
    children: readonly SnapshotSourceNode[]
): SnapshotSourceOutput {
    return renderedReason === undefined
        ? { children, status: 'rendered' }
        : { reason: renderedReason, status: 'notRendered' };
}
