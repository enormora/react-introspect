import {
    probeComponentHostType,
    type ProbeComponentMetadata,
    probeComponentMetadata,
    probeElementKeyMetadata,
    probeEmptyHostType,
    probeOpaqueHostType,
    probeValueMetadata
} from './probe-frame-contract.ts';
import type { ProbeRefs } from './probe-public-types.ts';
import { type ProbeRefHostTarget, resolveProbeRef, validateProbeRefs } from './probe-ref.ts';
import {
    createEmptyProbeSnapshot,
    createProbeSnapshotFromSource,
    type ProbeSnapshot,
    type SnapshotSourceNode
} from './probe-snapshot.ts';

export type ProbeHostProps = Readonly<Record<PropertyKey, unknown>>;

export type ProbeHostParent = ProbeHostContainer | ProbeHostInstance;

export type ProbeHostChild = ProbeHostInstance | ProbeTextInstance;

type ProbeChildStore = {
    readonly readChildren: () => readonly ProbeHostChild[];
    readonly writeChildren: (children: readonly ProbeHostChild[]) => void;
};

export type ProbeHostContainer = {
    readonly readRefs: () => ProbeRefs | undefined;
    readonly publish: (snapshot: ProbeSnapshot) => void;
    readonly readNextRenderCount: () => number;
    readonly readMounted: () => boolean;
    readonly writeMounted: (mounted: boolean) => void;
} & ProbeChildStore;

export type ProbeHostInstance = {
    readonly readProps: () => ProbeHostProps;
    readonly readPublicInstance: () => unknown;
    readonly refreshPublicInstance: (props: ProbeHostProps) => void;
    readonly type: string;
    readonly writeProps: (props: ProbeHostProps) => void;
} & ProbeChildStore;

export type ProbeTextInstance = {
    readonly readText: () => string;
    readonly writeText: (text: string) => void;
};

export type ProbeHostContext = {
    readonly refs: ProbeRefs | undefined;
};

const internalHostTypes = Object.freeze([
    probeComponentHostType,
    probeEmptyHostType,
    probeOpaqueHostType
]);
const probeComponentMetadataKeys = Object.freeze([
    'error',
    'givenChildren',
    'key',
    'props',
    'renderedReason',
    'type'
]);
const parentByChild = new WeakMap<ProbeHostChild, ProbeHostParent>();

function createChildStore(): ProbeChildStore {
    let currentChildren: readonly ProbeHostChild[] = [];

    return Object.freeze({
        readChildren() {
            return currentChildren;
        },
        writeChildren(children: readonly ProbeHostChild[]) {
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
        key !== probeComponentMetadata &&
        key !== probeElementKeyMetadata &&
        key !== probeValueMetadata;
}

function publicProps(props: ProbeHostProps): ProbeHostProps {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isPublicHostPropKey(key)) {
            result[key] = props[key];
        }
    }

    return Object.freeze(result);
}

function isProbeComponentMetadata(value: unknown): value is ProbeComponentMetadata {
    return isRecord(value) &&
        probeComponentMetadataKeys.every(function hasMetadataKey(key) {
            return hasProperty(value, key);
        });
}

function isTextInstance(child: ProbeHostChild): child is ProbeTextInstance {
    return !Reflect.has(child, 'type');
}

function readSpecialValue(instance: ProbeHostInstance): unknown {
    return instance.readProps()[probeValueMetadata];
}

function readHostKeyFromProps(props: ProbeHostProps): string | null {
    const key = props[probeElementKeyMetadata];

    return typeof key === 'string' ? key : null;
}

function readHostKey(instance: ProbeHostInstance): string | null {
    return readHostKeyFromProps(instance.readProps());
}

function readComponentMetadata(instance: ProbeHostInstance): ProbeComponentMetadata {
    const value = instance.readProps()[probeComponentMetadata];

    if (!isProbeComponentMetadata(value)) {
        return Object.freeze({
            error: undefined,
            givenChildren: undefined,
            key: null,
            props: Object.freeze({}),
            renderedReason: 'unsupported',
            type: probeComponentHostType
        });
    }

    return value;
}

function isProbeInternalHostType(type: string): boolean {
    return internalHostTypes.includes(type);
}

function toRefTarget(type: string, props: ProbeHostProps): ProbeRefHostTarget {
    return Object.freeze({
        key: readHostKeyFromProps(props),
        name: type,
        props: publicProps(props),
        type
    });
}

function resolvePublicInstance(
    refs: ProbeRefs | undefined,
    type: string,
    props: ProbeHostProps
): unknown {
    if (isProbeInternalHostType(type)) {
        return null;
    }

    return resolveProbeRef(refs, toRefTarget(type, props));
}

function collectRefTargets(child: ProbeHostChild): readonly ProbeRefHostTarget[] {
    if (isTextInstance(child)) {
        return Object.freeze([]);
    }

    const childTargets = child.readChildren().flatMap(collectRefTargets);

    if (isProbeInternalHostType(child.type)) {
        return childTargets;
    }

    return Object.freeze([
        toRefTarget(child.type, child.readProps()),
        ...childTargets
    ]);
}

function detachChild(child: ProbeHostChild): void {
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

function toSourceNode(child: ProbeHostChild): SnapshotSourceNode {
    if (isTextInstance(child)) {
        return { kind: 'text', value: child.readText() };
    }

    if (child.type === probeEmptyHostType || child.type === probeOpaqueHostType) {
        return {
            kind: child.type === probeEmptyHostType ? 'empty' : 'opaque',
            value: readSpecialValue(child)
        };
    }

    if (child.type === probeComponentHostType) {
        const metadata = readComponentMetadata(child);

        return {
            children: child.readChildren().map(toSourceNode),
            error: metadata.error,
            givenChildren: metadata.givenChildren,
            givenChildrenKind: 'react',
            key: metadata.key,
            props: metadata.props,
            renderedReason: metadata.renderedReason,
            type: metadata.type
        };
    }

    const children = child.readChildren().map(toSourceNode);

    return {
        children,
        error: undefined,
        givenChildren: children,
        givenChildrenKind: 'source',
        key: readHostKey(child),
        props: publicProps(child.readProps()),
        renderedReason: undefined,
        type: child.type
    };
}

export function appendChild(parent: ProbeHostParent, child: ProbeHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren([
        ...children,
        child
    ]);
    parentByChild.set(child, parent);
}

export function clearContainer(container: ProbeHostContainer): void {
    container.writeChildren([]);
}

export function createHostContainer(
    publish: (snapshot: ProbeSnapshot) => void,
    readNextRenderCount: () => number,
    refs: ProbeRefs | undefined
): ProbeHostContainer {
    let mounted = true;

    return Object.freeze({
        ...createChildStore(),
        publish,
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
    props: ProbeHostProps,
    _root: unknown,
    context: ProbeHostContext
): ProbeHostInstance {
    let currentProps = props;
    let currentPublicInstance = resolvePublicInstance(context.refs, type, props);

    return Object.freeze({
        ...createChildStore(),
        readProps() {
            return currentProps;
        },
        readPublicInstance() {
            return currentPublicInstance;
        },
        refreshPublicInstance(nextProps: ProbeHostProps) {
            currentPublicInstance = resolvePublicInstance(context.refs, type, nextProps);
        },
        type,
        writeProps(nextProps: ProbeHostProps) {
            currentProps = nextProps;
        }
    });
}

export function createTextInstance(text: string): ProbeTextInstance {
    let currentText = text;

    return Object.freeze({
        readText() {
            return currentText;
        },
        writeText(nextText: string) {
            currentText = nextText;
        }
    });
}

export function getChildHostContext(context: ProbeHostContext): ProbeHostContext {
    return context;
}

export function getRootHostContext(container: ProbeHostContainer): ProbeHostContext {
    return Object.freeze({ refs: container.readRefs() });
}

export function insertBefore(
    parent: ProbeHostParent,
    child: ProbeHostChild,
    beforeChild: ProbeHostChild
): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren(children.toSpliced(children.indexOf(beforeChild), 0, child));
    parentByChild.set(child, parent);
}

export function removeChild(parent: ProbeHostParent, child: ProbeHostChild): void {
    const children = parent.readChildren();
    const index = children.indexOf(child);

    if (index !== -1) {
        parent.writeChildren(children.toSpliced(index, 1));
    }

    parentByChild.delete(child);
}

export function toSnapshot(container: ProbeHostContainer): ProbeSnapshot {
    if (!container.readMounted()) {
        return createEmptyProbeSnapshot(container.readNextRenderCount());
    }

    return createProbeSnapshotFromSource(
        container.readChildren().map(toSourceNode),
        container.readNextRenderCount()
    );
}

export function validateContainerRefs(container: ProbeHostContainer): void {
    validateProbeRefs(
        container.readRefs(),
        container.readChildren().flatMap(collectRefTargets)
    );
}
