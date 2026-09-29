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
import {
    createIntrospectionSnapshotFromSource,
    toSnapshotSourceNodes
} from '../../snapshot/model/introspect-snapshot.ts';
import type { IntrospectionReconcilerRuntime } from '../root/introspect-reconciler-runtime.ts';

type IntrospectionHostProps = Readonly<Record<PropertyKey, unknown>>;

type IntrospectionHostParent = IntrospectionHostContainer | IntrospectionHostInstance;

type IntrospectionHostChild = IntrospectionHostInstance | IntrospectionTextInstance;

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

type IntrospectionHostInstance = {
    readonly readProps: () => IntrospectionHostProps;
    readonly readPublicInstance: () => unknown;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly refreshPublicInstance: (props: IntrospectionHostProps) => void;
    readonly type: string;
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeProps: (props: IntrospectionHostProps) => void;
} & IntrospectionChildStore;

type IntrospectionTextInstance = {
    readonly readText: () => string;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeText: (text: string) => void;
};

type HostConfigScheduling = Pick<
    IntrospectionReconcilerRuntime,
    'cancelTimeout' | 'readEventTimestamp' | 'scheduleMicrotask' | 'scheduleTimeout'
>;

type IntrospectionHostContext = {
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

function removeChild(parent: IntrospectionHostParent, child: IntrospectionHostChild): void {
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
            givenChildren: toSnapshotSourceNodes(metadata.givenChildren),
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
        kind: 'element',
        key: readHostKey(child.readProps()),
        props: readPublicHostProps(child.readProps()),
        renderedReason: undefined,
        type: child.type,
        visibility: child.readVisibility()
    };
}

function appendChild(parent: IntrospectionHostParent, child: IntrospectionHostChild): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren([
        ...children,
        child
    ]);
    parentByChild.set(child, parent);
}

function clearContainer(container: IntrospectionHostContainer): void {
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

function createHostInstance(
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

function createTextInstance(text: string): IntrospectionTextInstance {
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

function getChildHostContext(context: IntrospectionHostContext): IntrospectionHostContext {
    return context;
}

function getRootHostContext(container: IntrospectionHostContainer): IntrospectionHostContext {
    return { refs: container.readRefs() };
}

function insertBefore(
    parent: IntrospectionHostParent,
    child: IntrospectionHostChild,
    beforeChild: IntrospectionHostChild
): void {
    detachChild(child);

    const children = parent.readChildren();

    parent.writeChildren(children.toSpliced(children.indexOf(beforeChild), 0, child));
    parentByChild.set(child, parent);
}

function toSnapshot(container: IntrospectionHostContainer): IntrospectionSnapshot {
    if (!container.readMounted()) {
        return createEmptyIntrospectionSnapshot(container.readNextRenderCount());
    }

    return createIntrospectionSnapshotFromSource(
        container.readChildren().map(toSourceNode),
        container.readNextRenderCount(),
        container.readIdNormalization()
    );
}

function hideHostChild(child: IntrospectionHostChild): void {
    child.writeVisibility('hidden');
}

function unhideHostChild(child: IntrospectionHostChild): void {
    child.writeVisibility('visible');
}

export function validateContainerRefs(container: IntrospectionHostContainer): void {
    validateIntrospectionRefs(
        container.readRefs(),
        container.readChildren().flatMap(collectRefTargets)
    );
}

const defaultEventPriority = 32;

function noop(): void {
    return undefined;
}

function alwaysFalse(): boolean {
    return false;
}

function returnNull(): null {
    return null;
}

function getDefaultEventPriority(): number {
    return defaultEventPriority;
}

function publishContainerSnapshot(container: IntrospectionHostContainer): void {
    container.publish(toSnapshot(container));
}

function prepareForCommit(): null {
    return null;
}

export type IntrospectionHostConfig = {
    readonly [member: string]: unknown;
    readonly appendChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly appendChildToContainer: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly appendInitialChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly clearContainer: (container: IntrospectionHostContainer) => void;
    readonly commitTextUpdate: (instance: IntrospectionTextInstance, oldText: string, newText: string) => void;
    readonly commitUpdate: (
        instance: IntrospectionHostInstance,
        type: string,
        oldProps: IntrospectionHostProps,
        newProps: IntrospectionHostProps
    ) => void;
    readonly finalizeInitialChildren: () => boolean;
    readonly getChildHostContext: (context: IntrospectionHostContext) => IntrospectionHostContext;
    readonly getPublicInstance: (instance: IntrospectionHostInstance) => unknown;
    readonly getRootHostContext: (container: IntrospectionHostContainer) => IntrospectionHostContext;
    readonly hideInstance: (instance: IntrospectionHostInstance) => void;
    readonly insertBefore: (
        parent: IntrospectionHostParent,
        child: IntrospectionHostChild,
        beforeChild: IntrospectionHostChild
    ) => void;
    readonly prepareForCommit: () => null;
    readonly removeChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly unhideInstance: (instance: IntrospectionHostInstance) => void;
    readonly createInstance: (
        type: string,
        props: IntrospectionHostProps,
        root: unknown,
        context: IntrospectionHostContext
    ) => IntrospectionHostInstance;
    readonly createTextInstance: (
        text: string,
        root: unknown,
        context: IntrospectionHostContext
    ) => IntrospectionTextInstance;
    readonly hideTextInstance: (instance: IntrospectionTextInstance) => void;
    readonly insertInContainerBefore: (
        parent: IntrospectionHostParent,
        child: IntrospectionHostChild,
        beforeChild: IntrospectionHostChild
    ) => void;
    readonly removeChildFromContainer: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly resetAfterCommit: (container: IntrospectionHostContainer) => void;
    readonly unhideTextInstance: (instance: IntrospectionTextInstance, text: string) => void;
};

export function createIntrospectionHostConfig(scheduling: HostConfigScheduling): IntrospectionHostConfig {
    return {
        NotPendingTransition: null,
        HostTransitionContext: {
            _currentValue: null,
            _currentValue2: null
        },
        appendChild,
        appendChildToContainer: appendChild,
        appendInitialChild: appendChild,
        applyViewTransitionName: noop,
        beforeActiveInstanceBlur: noop,
        cancelTimeout: scheduling.cancelTimeout,
        cancelRootViewTransitionName: noop,
        cancelViewTransitionName: noop,
        clearActivityBoundary: noop,
        clearActivityBoundaryFromContainer: noop,
        clearContainer,
        clearSuspenseBoundary: noop,
        commitMount: noop,
        commitTextUpdate(instance: IntrospectionTextInstance, _oldText: string, newText: string) {
            instance.writeText(newText);
        },
        commitUpdate(
            instance: IntrospectionHostInstance,
            _type: string,
            _oldProps: IntrospectionHostProps,
            newProps: IntrospectionHostProps
        ) {
            instance.writeProps(newProps);
            instance.refreshPublicInstance(newProps);
        },
        createInstance: createHostInstance,
        createTextInstance,
        detachDeletedInstance: noop,
        finalizeInitialChildren: alwaysFalse,
        getChildHostContext,
        getCurrentUpdatePriority: getDefaultEventPriority,
        getPublicInstance(instance: IntrospectionHostInstance) {
            return instance.readPublicInstance();
        },
        getRootHostContext,
        hideInstance: hideHostChild,
        hideTextInstance: hideHostChild,
        insertBefore,
        insertInContainerBefore: insertBefore,
        isPrimaryRenderer: false,
        isSuspenseInstanceFallback: alwaysFalse,
        isSuspenseInstancePending: alwaysFalse,
        maySuspendCommit: alwaysFalse,
        maySuspendCommitInSyncRender: alwaysFalse,
        maySuspendCommitOnUpdate: alwaysFalse,
        noTimeout: -1,
        prepareForCommit,
        preparePortalMount: noop,
        removeChild,
        removeChildFromContainer: removeChild,
        resetAfterCommit: publishContainerSnapshot,
        resetFormInstance: noop,
        resolveEventTimeStamp: scheduling.readEventTimestamp,
        resolveEventType: returnNull,
        resolveUpdatePriority: getDefaultEventPriority,
        restoreRootViewTransitionName: noop,
        restoreViewTransitionName: noop,
        scheduleMicrotask: scheduling.scheduleMicrotask,
        scheduleTimeout: scheduling.scheduleTimeout,
        setCurrentUpdatePriority: noop,
        shouldAttemptEagerTransition: alwaysFalse,
        shouldSetTextContent: alwaysFalse,
        startSuspendingCommit: noop,
        stopViewTransition: noop,
        supportsHydration: false,
        supportsMicrotasks: true,
        supportsMutation: true,
        supportsPersistence: false,
        supportsTestSelectors: false,
        suspendInstance: noop,
        suspendOnActiveViewTransition: alwaysFalse,
        trackSchedulerEvent: noop,
        unhideInstance: unhideHostChild,
        unhideTextInstance: unhideHostChild,
        waitForCommitToBeReady: returnNull
    };
}
