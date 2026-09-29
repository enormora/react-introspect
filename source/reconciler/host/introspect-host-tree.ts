import {
    isInternalHostType,
    readHostKey,
    readInternalHost,
    readPublicHostProps
} from '../../render/protocol/introspect-host-protocol.ts';
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

const parentByChild = new WeakMap<IntrospectionHostChild, IntrospectionHostParent>();

function createChildStore(): IntrospectionChildStore {
    let currentChildren: readonly IntrospectionHostChild[] = [];

    return {
        readChildren() {
            return currentChildren;
        },
        writeChildren(children: readonly IntrospectionHostChild[]) {
            currentChildren = children;
        }
    };
}

function isTextInstance(child: IntrospectionHostChild): child is IntrospectionTextInstance {
    return !Reflect.has(child, 'type');
}

function toRefTarget(type: string, props: IntrospectionHostProps): IntrospectionRefHostTarget {
    return Object.freeze({
        key: readHostKey(props),
        name: type,
        props: readPublicHostProps(props),
        type
    });
}

function resolvePublicInstance(
    refs: IntrospectionRefs | undefined,
    type: string,
    props: IntrospectionHostProps
): unknown {
    if (isInternalHostType(type)) {
        return null;
    }

    return resolveIntrospectionRef(refs, toRefTarget(type, props));
}

function collectRefTargets(child: IntrospectionHostChild): readonly IntrospectionRefHostTarget[] {
    if (isTextInstance(child)) {
        return [];
    }

    const childTargets = child.readChildren().flatMap(collectRefTargets);

    if (isInternalHostType(child.type)) {
        return childTargets;
    }

    return [
        toRefTarget(child.type, child.readProps()),
        ...childTargets
    ];
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

    const internalHost = readInternalHost(child.type, child.readProps());

    if (internalHost.kind === 'empty' || internalHost.kind === 'opaque') {
        return { kind: internalHost.kind, value: internalHost.value, visibility: child.readVisibility() };
    }

    if (internalHost.kind === 'component') {
        const { metadata } = internalHost;

        return {
            activityMode: metadata.activityMode,
            children: child.readChildren().map(toSourceNode),
            caughtError: metadata.caughtError,
            givenChildren: metadata.givenChildren,
            givenChildrenKind: 'react',
            kind: 'element',
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
        caughtError: undefined,
        givenChildren: children,
        givenChildrenKind: 'source',
        kind: 'element',
        key: readHostKey(child.readProps()),
        props: readPublicHostProps(child.readProps()),
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

    return {
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
    };
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

    return {
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
    };
}

export function createTextInstance(text: string): IntrospectionTextInstance {
    let currentText = text;
    let currentVisibility: 'hidden' | 'visible' = 'visible';

    return {
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
    };
}

export function getChildHostContext(context: IntrospectionHostContext): IntrospectionHostContext {
    return context;
}

export function getRootHostContext(container: IntrospectionHostContainer): IntrospectionHostContext {
    return { refs: container.readRefs() };
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
