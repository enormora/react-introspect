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

export type TypeNaming = 'executed' | 'unexecuted';

type TypeNamers = {
    readonly [Name in keyof ElementKindByName]: (
        elementKind: ElementKindByName[Name],
        naming: TypeNaming
    ) => string | undefined;
};

function getFunctionTypeName(type: NamedFunction): string {
    return readDisplayName(type) ?? type.name;
}

function nameWrapper(wrapperName: string, innerName: string): string {
    return innerName === '' ? wrapperName : `${wrapperName}(${innerName})`;
}

function nameMemoInner(inner: unknown, naming: TypeNaming): string {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- memo names recurse into the wrapped type
    const innerName = findTypeName(inner, naming);

    return innerName === undefined || innerName === '' ? 'Memo' : innerName;
}

function nameLazy(elementKind: ElementKindByName['lazy'], naming: TypeNaming): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- lazy names recurse into the resolved type
    return naming === 'executed' ? findTypeName(elementKind.resolved, naming) : undefined;
}

function nameNothing(): undefined {
    return undefined;
}

const typeNamers: TypeNamers = {
    activity() {
        return 'Activity';
    },
    class(elementKind) {
        return getFunctionTypeName(elementKind.component);
    },
    context: nameNothing,
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
    lazy: nameLazy,
    memo(elementKind, naming) {
        return elementKind.displayName ?? nameMemoInner(elementKind.inner, naming);
    },
    other: nameNothing,
    suspense: nameNothing,
    viewTransition() {
        return 'ViewTransition';
    }
};

function nameElementKind<Name extends keyof ElementKindByName>(
    name: Name,
    elementKind: ElementKindByName[Name],
    naming: TypeNaming
): string | undefined {
    return typeNamers[name](elementKind, naming);
}

const snapshotNodeKinds: Readonly<Record<ReactElementKind['kind'], SnapshotNodeKind>> = {
    activity: 'component',
    class: 'component',
    context: 'component',
    forwardRef: 'component',
    fragment: 'fragment',
    function: 'component',
    host: 'host',
    lazy: 'component',
    memo: 'component',
    other: 'component',
    suspense: 'component',
    viewTransition: 'component'
};

export function getElementKind(type: unknown): SnapshotNodeKind {
    return snapshotNodeKinds[classifyElementType(type).kind];
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

function findTypeName(type: unknown, naming: TypeNaming): string | undefined {
    const elementKind = classifyElementType(type);

    return nameElementKind(elementKind.kind, elementKind, naming);
}

export function getTypeName(type: unknown, naming: TypeNaming): string {
    return findTypeName(type, naming) ?? 'Component';
}
