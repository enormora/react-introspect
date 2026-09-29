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

type ElementKindByName = {
    readonly [Kind in ReactElementKind as Kind['kind']]: Kind;
};

type TypeNamers = {
    readonly [Name in keyof ElementKindByName]: (elementKind: ElementKindByName[Name]) => string;
};

function getFunctionTypeName(type: NamedFunction): string {
    const displayName: unknown = Reflect.get(type, 'displayName');

    return typeof displayName === 'string' ? displayName : type.name;
}

function nameComponent(): string {
    return 'Component';
}

const typeNamers: TypeNamers = {
    activity() {
        return 'Activity';
    },
    context: nameComponent,
    forwardRef: nameComponent,
    fragment() {
        return 'Fragment';
    },
    function(elementKind) {
        return getFunctionTypeName(elementKind.component);
    },
    host(elementKind) {
        return elementKind.name;
    },
    lazy: nameComponent,
    memo: nameComponent,
    other: nameComponent,
    suspense: nameComponent,
    viewTransition() {
        return 'ViewTransition';
    }
};

function nameElementKind<Name extends keyof ElementKindByName>(
    name: Name,
    elementKind: ElementKindByName[Name]
): string {
    return typeNamers[name](elementKind);
}

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

export function getTypeName(type: unknown): string {
    const elementKind = classifyElementType(type);

    return nameElementKind(elementKind.kind, elementKind);
}
