import React from 'react';
import type {
    ElementChildrenState,
    SnapshotNode,
    SnapshotNodeKind,
    SnapshotProps,
    SnapshotSourceElement
} from './reflect-snapshot-contract.ts';

const reactWrapperNames = new Map<unknown, string>([
    [ Symbol.for('react.activity'), 'Activity' ],
    [ Symbol.for('react.view_transition'), 'ViewTransition' ]
]);

type NamedFunction = {
    readonly name: string;
};

function rendersOwnChildren(type: unknown): boolean {
    return typeof type === 'string' || type === React.Fragment;
}

export function getTextContent(nodes: readonly SnapshotNode[]): string {
    return nodes
        .map(function readTextContent(node) {
            return node.textContent;
        })
        .join('');
}

export function freezePropsWithoutChildren(props: SnapshotProps): SnapshotProps {
    const publicProps: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (key !== 'children' && key !== 'key') {
            publicProps[key] = props[key];
        }
    }

    return Object.freeze(publicProps);
}

export function getElementChildrenState(type: unknown, children: readonly SnapshotNode[]): ElementChildrenState {
    const renderedChildren = rendersOwnChildren(type) ? children : Object.freeze([]);

    return {
        renderedChildren,
        renderedReason: rendersOwnChildren(type) ? undefined : 'depth',
        textContent: getTextContent(renderedChildren.length > 0 ? renderedChildren : children)
    };
}

export function getElementKind(type: unknown): SnapshotNodeKind {
    if (typeof type === 'string') {
        return 'host';
    }

    return type === React.Fragment ? 'fragment' : 'component';
}

export function getIndexedPath(parentPath: string, index: number, name: string): string {
    return parentPath === 'root' ? name : `${parentPath} > ${name}[${index}]`;
}

export function getSourceElementKind(element: SnapshotSourceElement): SnapshotNodeKind {
    return getElementKind(element.type);
}

function getFunctionTypeName(type: NamedFunction): string {
    const displayName: unknown = Reflect.get(type, 'displayName');

    return typeof displayName === 'string' ? displayName : type.name;
}

export function getTypeName(type: unknown): string {
    if (typeof type === 'string') {
        return type;
    }

    const wrapperName = reactWrapperNames.get(type);

    if (wrapperName !== undefined || type === React.Fragment) {
        return wrapperName ?? 'Fragment';
    }

    return typeof type === 'function' ? getFunctionTypeName(type) : 'Component';
}
