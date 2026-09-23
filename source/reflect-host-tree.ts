import {
    reflectComponentHostType,
    type ReflectComponentMetadata,
    reflectComponentMetadata,
    reflectElementKeyMetadata,
    reflectEmptyHostType,
    reflectOpaqueHostType,
    reflectValueMetadata
} from './reflect-frame-contract.ts';
import type { ReflectIdNormalization } from './reflect-id-normalization.ts';
import type { ReflectRefs } from './reflect-public-types.ts';
import { type ReflectRefHostTarget, resolveReflectRef, validateReflectRefs } from './reflect-ref.ts';
import {
    createEmptyReflectSnapshot,
    type ReflectSnapshot,
    type SnapshotSourceNode
} from './reflect-snapshot-contract.ts';
import { createReflectSnapshotFromSource } from './reflect-snapshot.ts';

export type ReflectHostProps = Readonly<Record<PropertyKey, unknown>>;

export type ReflectHostParent = ReflectHostContainer | ReflectHostInstance;

export type ReflectHostChild = ReflectHostInstance | ReflectTextInstance;

type ReflectChildStore = {
    readonly readChildren: () => readonly ReflectHostChild[];
    readonly writeChildren: (children: readonly ReflectHostChild[]) => void;
};

export type ReflectHostContainer = {
    readonly readIdNormalization: () => ReflectIdNormalization;
    readonly readRefs: () => ReflectRefs | undefined;
    readonly publish: (snapshot: ReflectSnapshot) => void;
    readonly readNextRenderCount: () => number;
    readonly readMounted: () => boolean;
    readonly writeMounted: (mounted: boolean) => void;
} & ReflectChildStore;

export type ReflectHostInstance = {
    readonly readProps: () => ReflectHostProps;
    readonly readPublicInstance: () => unknown;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly refreshPublicInstance: (props: ReflectHostProps) => void;
    readonly type: string;
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeProps: (props: ReflectHostProps) => void;
} & ReflectChildStore;

export type ReflectTextInstance = {
    readonly readText: () => string;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeText: (text: string) => void;
};

export type ReflectHostContext = {
    readonly refs: ReflectRefs | undefined;
};

const internalHostTypes = Object.freeze([
    reflectComponentHostType,
    reflectEmptyHostType,
    reflectOpaqueHostType
]);
const reflectComponentMetadataKeys = Object.freeze([
    'activityMode',
    'error',
    'givenChildren',
    'key',
    'props',
    'renderedReason',
    'type'
]);
const parentByChild = new WeakMap<ReflectHostChild, ReflectHostParent>();

function createChildStore(): ReflectChildStore {
    let currentChildren: readonly ReflectHostChild[] = [];

    return Object.freeze({
        readChildren() {
            return currentChildren;
        },
        writeChildren(children: readonly ReflectHostChild[]) {
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
        key !== reflectComponentMetadata &&
        key !== reflectElementKeyMetadata &&
        key !== reflectValueMetadata;
}

function publicProps(props: ReflectHostProps): ReflectHostProps {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isPublicHostPropKey(key)) {
            result[key] = props[key];
        }
    }

    return Object.freeze(result);
}

function isReflectComponentMetadata(value: unknown): value is ReflectComponentMetadata {
    return isRecord(value) &&
        reflectComponentMetadataKeys.every(function hasMetadataKey(key) {
            return hasProperty(value, key);
        });
}

function isTextInstance(child: ReflectHostChild): child is ReflectTextInstance {
    return !Reflect.has(child, 'type');
}

function readSpecialValue(instance: ReflectHostInstance): unknown {
    return instance.readProps()[reflectValueMetadata];
}

function readHostKeyFromProps(props: ReflectHostProps): string | null {
    const key = props[reflectElementKeyMetadata];

    return typeof key === 'string' ? key : null;
}

function readHostKey(instance: ReflectHostInstance): string | null {
    return readHostKeyFromProps(instance.readProps());
}

function readComponentMetadata(instance: ReflectHostInstance): ReflectComponentMetadata {
    const value = instance.readProps()[reflectComponentMetadata];

    if (!isReflectComponentMetadata(value)) {
        return Object.freeze({
            activityMode: undefined,
            error: undefined,
            givenChildren: undefined,
            key: null,
            props: Object.freeze({}),
            renderedReason: 'unsupported',
            type: reflectComponentHostType
        });
    }

    return value;
}

function isReflectInternalHostType(type: string): boolean {
    return internalHostTypes.includes(type);
}

function toRefTarget(type: string, props: ReflectHostProps): ReflectRefHostTarget {
    return Object.freeze({
        key: readHostKeyFromProps(props),
        name: type,
        props: publicProps(props),
        type
    });
}

function resolvePublicInstance(
    refs: ReflectRefs | undefined,
    type: string,
    props: ReflectHostProps
): unknown {
    if (isReflectInternalHostType(type)) {
        return null;
    }

    return resolveReflectRef(refs, toRefTarget(type, props));
}

function collectRefTargets(child: ReflectHostChild): readonly ReflectRefHostTarget[] {
    if (isTextInstance(child)) {
        return Object.freeze([]);
    }

    const childTargets = child.readChildren().flatMap(collectRefTargets);

    if (isReflectInternalHostType(child.type)) {
        return childTargets;
    }

    return Object.freeze([
        toRefTarget(child.type, child.readProps()),
        ...childTargets
    ]);
}

function detachChild(child: ReflectHostChild): void {
    const parent = parentByChild.get(child);

    if (parent === undefined) {
        return;
    }

    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

function toSourceNode(child: ReflectHostChild): SnapshotSourceNode {
    if (isTextInstance(child)) {
        return { kind: 'text', value: child.readText(), visibility: child.readVisibility() };
    }

    if (child.type === reflectEmptyHostType || child.type === reflectOpaqueHostType) {
        return {
            kind: child.type === reflectEmptyHostType ? 'empty' : 'opaque',
            value: readSpecialValue(child),
            visibility: child.readVisibility()
        };
    }

    if (child.type === reflectComponentHostType) {
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

export function appendChild(parent: ReflectHostParent, child: ReflectHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren([
        ...children,
        child
    ]);
    parentByChild.set(child, parent);
}

export function clearContainer(container: ReflectHostContainer): void {
    container.writeChildren([]);
}

export function createHostContainer(
    publish: (snapshot: ReflectSnapshot) => void,
    readNextRenderCount: () => number,
    idNormalization: ReflectIdNormalization,
    refs: ReflectRefs | undefined
): ReflectHostContainer {
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
    props: ReflectHostProps,
    _root: unknown,
    context: ReflectHostContext
): ReflectHostInstance {
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
        refreshPublicInstance(nextProps: ReflectHostProps) {
            currentPublicInstance = resolvePublicInstance(context.refs, type, nextProps);
        },
        type,
        writeVisibility(visibility: 'hidden' | 'visible') {
            currentVisibility = visibility;
        },
        writeProps(nextProps: ReflectHostProps) {
            currentProps = nextProps;
        }
    });
}

export function createTextInstance(text: string): ReflectTextInstance {
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

export function getChildHostContext(context: ReflectHostContext): ReflectHostContext {
    return context;
}

export function getRootHostContext(container: ReflectHostContainer): ReflectHostContext {
    return Object.freeze({ refs: container.readRefs() });
}

export function insertBefore(
    parent: ReflectHostParent,
    child: ReflectHostChild,
    beforeChild: ReflectHostChild
): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren(children.toSpliced(children.indexOf(beforeChild), 0, child));
    parentByChild.set(child, parent);
}

export function removeChild(parent: ReflectHostParent, child: ReflectHostChild): void {
    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

export function toSnapshot(container: ReflectHostContainer): ReflectSnapshot {
    if (!container.readMounted()) {
        return createEmptyReflectSnapshot(container.readNextRenderCount());
    }

    return createReflectSnapshotFromSource(
        container.readChildren().map(toSourceNode),
        container.readNextRenderCount(),
        container.readIdNormalization()
    );
}

export function hideInstance(instance: ReflectHostInstance): void {
    instance.writeVisibility('hidden');
}

export function hideTextInstance(instance: ReflectTextInstance): void {
    instance.writeVisibility('hidden');
}

export function unhideInstance(instance: ReflectHostInstance): void {
    instance.writeVisibility('visible');
}

export function unhideTextInstance(instance: ReflectTextInstance): void {
    instance.writeVisibility('visible');
}

export function validateContainerRefs(container: ReflectHostContainer): void {
    validateReflectRefs(
        container.readRefs(),
        container.readChildren().flatMap(collectRefTargets)
    );
}
