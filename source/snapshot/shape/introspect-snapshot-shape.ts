import {
    classifyElementType,
    isReactReservedPropKey,
    type ReactElementKind
} from '../../values/introspect-react-element-kind.ts';
import type {
    SnapshotNode,
    SnapshotNodeKind,
    SnapshotProps
} from '../model/introspect-snapshot-contract.ts';

type NamedFunction = {
    readonly name: string;
};

const builtInTypeNames: Readonly<Record<Exclude<ReactElementKind['kind'], 'function' | 'host'>, string>> = {
    activity: 'Activity',
    context: 'Component',
    forwardRef: 'Component',
    fragment: 'Fragment',
    lazy: 'Component',
    memo: 'Component',
    other: 'Component',
    suspense: 'Component',
    viewTransition: 'ViewTransition'
};

export function getElementKind(type: unknown): SnapshotNodeKind {
    const { kind } = classifyElementType(type);

    return kind === 'host' || kind === 'fragment' ? kind : 'component';
}

export function getTextContent(nodes: readonly SnapshotNode[]): string {
    return nodes
        .map(function readTextContent(node) {
            return node.textContent;
        })
        .join('');
}

export function freezePublicElementProps(props: SnapshotProps): SnapshotProps {
    const publicProps: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (!isReactReservedPropKey(key)) {
            publicProps[key] = props[key];
        }
    }

    return Object.freeze(publicProps);
}

export function getIndexedPath(parentPath: string, index: number | string, name: string): string {
    return parentPath === 'root' ? name : `${parentPath} > ${name}[${index}]`;
}

function getFunctionTypeName(type: NamedFunction): string {
    const displayName: unknown = Reflect.get(type, 'displayName');

    return typeof displayName === 'string' ? displayName : type.name;
}

export function getTypeName(type: unknown): string {
    const elementKind = classifyElementType(type);

    if (elementKind.kind === 'host') {
        return elementKind.name;
    }

    return elementKind.kind === 'function'
        ? getFunctionTypeName(elementKind.component)
        : builtInTypeNames[elementKind.kind];
}
