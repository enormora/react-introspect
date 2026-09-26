import {
    introspectionComponentHostType,
    type IntrospectionComponentMetadata,
    introspectionComponentMetadata,
    introspectionElementKeyMetadata,
    introspectionEmptyHostType,
    introspectionOpaqueHostType,
    introspectionValueMetadata
} from '../../render/frame/introspect-frame-contract.ts';
import type { IntrospectionIdNormalization } from '../../snapshot/normalization/introspect-id-normalization.ts';
import type { IntrospectionRefs } from '../../public/introspect-public-types.ts';
import {
    type IntrospectionRefHostTarget,
    resolveIntrospectionRef,
    validateIntrospectionRefs
} from '../../refs/introspect-ref.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot,
    type SnapshotSourceNode
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import { createIntrospectionSnapshotFromSource } from '../../snapshot/model/introspect-snapshot.ts';

export type IntrospectionHostProps = Readonly<Record<PropertyKey, unknown>>;

export type IntrospectionHostParent = IntrospectionHostContainer | IntrospectionHostInstance;

export type IntrospectionHostChild = IntrospectionHostInstance | IntrospectionTextInstance;

type IntrospectionChildStore = {
    readonly readChildren: () => readonly IntrospectionHostChild[];
    readonly writeChildren: (children: readonly IntrospectionHostChild[]) => void;
};

export type IntrospectionHostContainer = {
    readonly readIdNormalization: () => IntrospectionIdNormalization;
    readonly readRefs: () => IntrospectionRefs | undefined;
    readonly publish: (snapshot: IntrospectionSnapshot) => void;
    readonly readNextRenderCount: () => number;
    readonly readMounted: () => boolean;
    readonly writeMounted: (mounted: boolean) => void;
} & IntrospectionChildStore;

export type IntrospectionHostInstance = {
    readonly readProps: () => IntrospectionHostProps;
    readonly readPublicInstance: () => unknown;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly refreshPublicInstance: (props: IntrospectionHostProps) => void;
    readonly type: string;
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeProps: (props: IntrospectionHostProps) => void;
} & IntrospectionChildStore;

export type IntrospectionTextInstance = {
    readonly readText: () => string;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeText: (text: string) => void;
};

export type IntrospectionHostContext = {
    readonly refs: IntrospectionRefs | undefined;
};

const internalHostTypes = Object.freeze([
    introspectionComponentHostType,
    introspectionEmptyHostType,
    introspectionOpaqueHostType
]);
const introspectionComponentMetadataKeys = Object.freeze([
    'activityMode',
    'error',
    'givenChildren',
    'key',
    'props',
    'renderedReason',
    'type'
]);
const parentByChild = new WeakMap<IntrospectionHostChild, IntrospectionHostParent>();

function createChildStore(): IntrospectionChildStore {
    let currentChildren: readonly IntrospectionHostChild[] = [];

    return Object.freeze({
        readChildren() {
            return currentChildren;
        },
        writeChildren(children: readonly IntrospectionHostChild[]) {
            currentChildren = children;
        }
    });
}

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Object.hasOwn(value, property);
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function isPublicHostPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== introspectionComponentMetadata &&
        key !== introspectionElementKeyMetadata &&
        key !== introspectionValueMetadata;
}

function publicProps(props: IntrospectionHostProps): IntrospectionHostProps {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isPublicHostPropKey(key)) {
            result[key] = props[key];
        }
    }

    return Object.freeze(result);
}

function isIntrospectionComponentMetadata(value: unknown): value is IntrospectionComponentMetadata {
    return isRecord(value) &&
        introspectionComponentMetadataKeys.every(function hasMetadataKey(key) {
            return hasProperty(value, key);
        });
}

function isTextInstance(child: IntrospectionHostChild): child is IntrospectionTextInstance {
    return !Reflect.has(child, 'type');
}

function readSpecialValue(instance: IntrospectionHostInstance): unknown {
    return instance.readProps()[introspectionValueMetadata];
}

function readHostKeyFromProps(props: IntrospectionHostProps): string | null {
    const key = props[introspectionElementKeyMetadata];

    return typeof key === 'string' ? key : null;
}

function readHostKey(instance: IntrospectionHostInstance): string | null {
    return readHostKeyFromProps(instance.readProps());
}

function readComponentMetadata(instance: IntrospectionHostInstance): IntrospectionComponentMetadata {
    const value = instance.readProps()[introspectionComponentMetadata];

    if (!isIntrospectionComponentMetadata(value)) {
        return Object.freeze({
            activityMode: undefined,
            error: undefined,
            givenChildren: undefined,
            key: null,
            props: Object.freeze({}),
            renderedReason: 'unsupported',
            type: introspectionComponentHostType
        });
    }

    return value;
}

function isIntrospectionInternalHostType(type: string): boolean {
    return internalHostTypes.includes(type);
}

function toRefTarget(type: string, props: IntrospectionHostProps): IntrospectionRefHostTarget {
    return Object.freeze({
        key: readHostKeyFromProps(props),
        name: type,
        props: publicProps(props),
        type
    });
}

function resolvePublicInstance(
    refs: IntrospectionRefs | undefined,
    type: string,
    props: IntrospectionHostProps
): unknown {
    if (isIntrospectionInternalHostType(type)) {
        return null;
    }

    return resolveIntrospectionRef(refs, toRefTarget(type, props));
}

function collectRefTargets(child: IntrospectionHostChild): readonly IntrospectionRefHostTarget[] {
    if (isTextInstance(child)) {
        return Object.freeze([]);
    }

    const childTargets = child.readChildren().flatMap(collectRefTargets);

    if (isIntrospectionInternalHostType(child.type)) {
        return childTargets;
    }

    return Object.freeze([
        toRefTarget(child.type, child.readProps()),
        ...childTargets
    ]);
}

export function removeChild(parent: IntrospectionHostParent, child: IntrospectionHostChild): void {
    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

function detachChild(child: IntrospectionHostChild): void {
    const parent = parentByChild.get(child);

    if (parent !== undefined) {
        removeChild(parent, child);
    }
}

function toSourceNode(child: IntrospectionHostChild): SnapshotSourceNode {
    if (isTextInstance(child)) {
        return { kind: 'text', value: child.readText(), visibility: child.readVisibility() };
    }

    if (child.type === introspectionEmptyHostType || child.type === introspectionOpaqueHostType) {
        return {
            kind: child.type === introspectionEmptyHostType ? 'empty' : 'opaque',
            value: readSpecialValue(child),
            visibility: child.readVisibility()
        };
    }

    if (child.type === introspectionComponentHostType) {
        const metadata = readComponentMetadata(child);

        return {
            activityMode: metadata.activityMode,
            children: child.readChildren().map(toSourceNode),
            error: metadata.error,
            givenChildren: metadata.givenChildren,
            givenChildrenKind: 'react',
            key: metadata.key,
            props: metadata.props,
            renderedReason: metadata.renderedReason,
            type: metadata.type,
            visibility: child.readVisibility()
        };
    }

    const children = child.readChildren().map(toSourceNode);

    return {
        activityMode: undefined,
        children,
        error: undefined,
        givenChildren: children,
        givenChildrenKind: 'source',
        key: readHostKey(child),
        props: publicProps(child.readProps()),
        renderedReason: undefined,
        type: child.type,
        visibility: child.readVisibility()
    };
}

export function appendChild(parent: IntrospectionHostParent, child: IntrospectionHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren([
        ...children,
        child
    ]);
    parentByChild.set(child, parent);
}

export function clearContainer(container: IntrospectionHostContainer): void {
    container.writeChildren([]);
}

export function createHostContainer(
    publish: (snapshot: IntrospectionSnapshot) => void,
    readNextRenderCount: () => number,
    idNormalization: IntrospectionIdNormalization,
    refs: IntrospectionRefs | undefined
): IntrospectionHostContainer {
    let mounted = true;

    return Object.freeze({
        ...createChildStore(),
        publish,
        readIdNormalization() {
            return idNormalization;
        },
        readMounted() {
            return mounted;
        },
        readNextRenderCount,
        readRefs() {
            return refs;
        },
        writeMounted(nextMounted: boolean) {
            mounted = nextMounted;
        }
    });
}

export function createHostInstance(
    type: string,
    props: IntrospectionHostProps,
    _root: unknown,
    context: IntrospectionHostContext
): IntrospectionHostInstance {
    let currentProps = props;
    let currentPublicInstance = resolvePublicInstance(context.refs, type, props);
    let currentVisibility: 'hidden' | 'visible' = 'visible';

    return Object.freeze({
        ...createChildStore(),
        readProps() {
            return currentProps;
        },
        readPublicInstance() {
            return currentPublicInstance;
        },
        readVisibility() {
            return currentVisibility;
        },
        refreshPublicInstance(nextProps: IntrospectionHostProps) {
            currentPublicInstance = resolvePublicInstance(context.refs, type, nextProps);
        },
        type,
        writeVisibility(visibility: 'hidden' | 'visible') {
            currentVisibility = visibility;
        },
        writeProps(nextProps: IntrospectionHostProps) {
            currentProps = nextProps;
        }
    });
}

export function createTextInstance(text: string): IntrospectionTextInstance {
    let currentText = text;
    let currentVisibility: 'hidden' | 'visible' = 'visible';

    return Object.freeze({
        readText() {
            return currentText;
        },
        readVisibility() {
            return currentVisibility;
        },
        writeVisibility(visibility: 'hidden' | 'visible') {
            currentVisibility = visibility;
        },
        writeText(nextText: string) {
            currentText = nextText;
        }
    });
}

export function getChildHostContext(context: IntrospectionHostContext): IntrospectionHostContext {
    return context;
}

export function getRootHostContext(container: IntrospectionHostContainer): IntrospectionHostContext {
    return Object.freeze({ refs: container.readRefs() });
}

export function insertBefore(
    parent: IntrospectionHostParent,
    child: IntrospectionHostChild,
    beforeChild: IntrospectionHostChild
): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren(children.toSpliced(children.indexOf(beforeChild), 0, child));
    parentByChild.set(child, parent);
}

export function toSnapshot(container: IntrospectionHostContainer): IntrospectionSnapshot {
    if (!container.readMounted()) {
        return createEmptyIntrospectionSnapshot(container.readNextRenderCount());
    }

    return createIntrospectionSnapshotFromSource(
        container.readChildren().map(toSourceNode),
        container.readNextRenderCount(),
        container.readIdNormalization()
    );
}

export function hideInstance(instance: IntrospectionHostInstance): void {
    instance.writeVisibility('hidden');
}

export function hideTextInstance(instance: IntrospectionTextInstance): void {
    instance.writeVisibility('hidden');
}

export function unhideInstance(instance: IntrospectionHostInstance): void {
    instance.writeVisibility('visible');
}

export function unhideTextInstance(instance: IntrospectionTextInstance): void {
    instance.writeVisibility('visible');
}

export function validateContainerRefs(container: IntrospectionHostContainer): void {
    validateIntrospectionRefs(
        container.readRefs(),
        container.readChildren().flatMap(collectRefTargets)
    );
}
