import {
    classifyElementType,
    isReactReservedPropKey,
    type ReactElementKind,
    readDisplayName
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
    return readDisplayName(type) ?? type.name;
}

function nameWrapper(wrapperName: string, innerName: string): string {
    return innerName === '' ? wrapperName : `${wrapperName}(${innerName})`;
}

function nameMemoInner(inner: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- memo names recurse into the wrapped type
    const innerName = getTypeName(inner);

    return innerName === '' ? 'Memo' : innerName;
}

function nameComponent(): string {
    return 'Component';
}

const typeNamers: TypeNamers = {
    activity() {
        return 'Activity';
    },
    context: nameComponent,
    forwardRef(elementKind) {
        return elementKind.displayName ?? nameWrapper('ForwardRef', getFunctionTypeName(elementKind.render));
    },
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
    memo(elementKind) {
        return elementKind.displayName ?? nameMemoInner(elementKind.inner);
    },
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
