import type { TimeoutIdentifier } from '@enormora/clock';
import type { IntrospectionIdNormalization } from '../../snapshot/normalization/id-normalization.ts';
import type { IntrospectionRefs } from '../../public/public-types.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot
} from '../../snapshot/model/snapshot-contract.ts';
import { createHostSnapshot, resolvePublicInstance, validateHostRefs } from './host-projection.ts';

type IntrospectionHostProps = Readonly<Record<PropertyKey, unknown>>;

type IntrospectionHostParent = IntrospectionHostContainer | IntrospectionHostInstance;

type IntrospectionHostChild = IntrospectionHostInstance | IntrospectionTextInstance;

type IntrospectionChildStore = {
    readonly readChildren: () => readonly IntrospectionHostChild[];
    readonly writeChildren: (children: readonly IntrospectionHostChild[]) => void;
};

export type IntrospectionHostContainer = IntrospectionHostContainerHooks & {
    readonly idNormalization: IntrospectionIdNormalization;
    readonly refs: IntrospectionRefs | undefined;
    readonly beginCommit: (mounted: boolean) => void;
    readonly discard: (renderCount: number) => void;
    readonly readMounted: () => boolean;
    readonly validateRefs: () => void;
} & IntrospectionChildStore;

export type IntrospectionHostContainerHooks = {
    readonly captureSnapshotError: (cause: unknown, container: IntrospectionHostContainerControl) => void;
    readonly publish: (snapshot: IntrospectionSnapshot) => void;
    readonly readNextRenderCount: () => number;
};

export type IntrospectionHostContainerControl = Pick<
    IntrospectionHostContainer,
    'beginCommit' | 'discard' | 'readMounted' | 'validateRefs'
>;

type IntrospectionHostInstance = {
    readonly kind: 'host';
    readonly readProps: () => IntrospectionHostProps;
    readonly readPublicInstance: () => unknown;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly type: string;
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly update: (props: IntrospectionHostProps) => void;
} & IntrospectionChildStore;

type IntrospectionTextInstance = {
    readonly kind: 'text';
    readonly readText: () => string;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly writeVisibility: (visibility: 'hidden' | 'visible') => void;
    readonly writeText: (text: string) => void;
};

export const noHostTimeout = -1;

export type IntrospectionHostScheduling = {
    readonly cancelTimeout: (timeoutIdentifier: TimeoutIdentifier) => void;
    readonly readCurrentUpdatePriority: () => number;
    readonly readEventTimestamp: () => number;
    readonly resolveUpdatePriority: () => number;
    readonly scheduleMicrotask: (action: () => void) => void;
    readonly scheduleTimeout: <HandlerArguments extends readonly unknown[]>(
        handler: (...handlerArguments: HandlerArguments) => void,
        delayInMilliseconds: number,
        ...handlerArguments: HandlerArguments
    ) => TimeoutIdentifier;
    readonly writeCurrentUpdatePriority: (priority: number) => void;
};

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
        kind: 'host',
        readProps() {
            return currentProps;
        },
        readPublicInstance() {
            return currentPublicInstance;
        },
        readVisibility() {
            return currentVisibility;
        },
        type,
        update(nextProps: IntrospectionHostProps) {
            currentProps = nextProps;
            currentPublicInstance = resolvePublicInstance(context.refs, type, nextProps);
        },
        writeVisibility(visibility: 'hidden' | 'visible') {
            currentVisibility = visibility;
        }
    };
}

function createTextInstance(text: string): IntrospectionTextInstance {
    let currentText = text;
    let currentVisibility: 'hidden' | 'visible' = 'visible';

    return {
        kind: 'text',
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
    return { refs: container.refs };
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

function hideHostChild(child: IntrospectionHostChild): void {
    child.writeVisibility('hidden');
}

function unhideHostChild(child: IntrospectionHostChild): void {
    child.writeVisibility('visible');
}

export function createHostContainer(
    hooks: IntrospectionHostContainerHooks,
    idNormalization: IntrospectionIdNormalization,
    refs: IntrospectionRefs | undefined
): IntrospectionHostContainer {
    const { captureSnapshotError, publish, readNextRenderCount } = hooks;
    let mounted = true;
    const childStore = createChildStore();
    const container: IntrospectionHostContainer = {
        ...childStore,
        captureSnapshotError,
        beginCommit(nextMounted: boolean) {
            mounted = nextMounted;
        },
        discard(renderCount: number) {
            mounted = false;
            childStore.writeChildren([]);
            publish(createEmptyIntrospectionSnapshot(renderCount));
        },
        idNormalization,
        publish,
        readMounted() {
            return mounted;
        },
        readNextRenderCount,
        refs,
        validateRefs() {
            validateHostRefs(refs, childStore.readChildren());
        }
    };

    return container;
}

function noop(): void {
    return undefined;
}

function alwaysFalse(): boolean {
    return false;
}

function returnNull(): null {
    return null;
}

function readContainerSnapshot(container: IntrospectionHostContainer): IntrospectionSnapshot | undefined {
    try {
        return createHostSnapshot(container);
    } catch (error) {
        container.captureSnapshotError(error, container);

        return undefined;
    }
}

function publishContainerSnapshot(container: IntrospectionHostContainer): void {
    const snapshot = readContainerSnapshot(container);

    if (snapshot !== undefined) {
        container.publish(snapshot);
    }
}

function prepareForCommit(): null {
    return null;
}

export type IntrospectionHostConfig = {
    readonly [member: string]: unknown;
    readonly appendChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly appendChildToContainer: (container: IntrospectionHostContainer, child: IntrospectionHostChild) => void;
    readonly appendInitialChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly clearContainer: (container: IntrospectionHostContainer) => void;
    readonly commitTextUpdate: (instance: IntrospectionTextInstance, oldText: string, newText: string) => void;
    readonly commitUpdate: (
        instance: IntrospectionHostInstance,
        type: string,
        oldProps: IntrospectionHostProps,
        newProps: IntrospectionHostProps
    ) => void;
    readonly finalizeInitialChildren: (
        instance: IntrospectionHostInstance,
        type: string,
        props: IntrospectionHostProps,
        context: IntrospectionHostContext
    ) => boolean;
    readonly getChildHostContext: (context: IntrospectionHostContext) => IntrospectionHostContext;
    readonly getPublicInstance: (instance: IntrospectionHostChild) => unknown;
    readonly getRootHostContext: (container: IntrospectionHostContainer) => IntrospectionHostContext;
    readonly hideInstance: (instance: IntrospectionHostInstance) => void;
    readonly insertBefore: (
        parent: IntrospectionHostParent,
        child: IntrospectionHostChild,
        beforeChild: IntrospectionHostChild
    ) => void;
    readonly prepareForCommit: () => null;
    readonly removeChild: (parent: IntrospectionHostParent, child: IntrospectionHostChild) => void;
    readonly unhideInstance: (instance: IntrospectionHostInstance, props: IntrospectionHostProps) => void;
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
        container: IntrospectionHostContainer,
        child: IntrospectionHostChild,
        beforeChild: IntrospectionHostChild
    ) => void;
    readonly removeChildFromContainer: (
        container: IntrospectionHostContainer,
        child: IntrospectionHostChild
    ) => void;
    readonly resetAfterCommit: (container: IntrospectionHostContainer) => void;
    readonly unhideTextInstance: (instance: IntrospectionTextInstance, text: string) => void;
};

export function createIntrospectionHostConfig(scheduling: IntrospectionHostScheduling): IntrospectionHostConfig {
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
            instance.update(newProps);
        },
        createInstance: createHostInstance,
        createTextInstance,
        detachDeletedInstance: noop,
        finalizeInitialChildren: alwaysFalse,
        getChildHostContext,
        getCurrentUpdatePriority: scheduling.readCurrentUpdatePriority,
        getPublicInstance(instance: IntrospectionHostChild) {
            return instance.kind === 'host' ? instance.readPublicInstance() : instance;
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
        noTimeout: noHostTimeout,
        prepareForCommit,
        preparePortalMount: noop,
        removeChild,
        removeChildFromContainer: removeChild,
        resetAfterCommit: publishContainerSnapshot,
        resetFormInstance: noop,
        resolveEventTimeStamp: scheduling.readEventTimestamp,
        resolveEventType: returnNull,
        resolveUpdatePriority: scheduling.resolveUpdatePriority,
        restoreRootViewTransitionName: noop,
        restoreViewTransitionName: noop,
        scheduleMicrotask: scheduling.scheduleMicrotask,
        scheduleTimeout: scheduling.scheduleTimeout,
        setCurrentUpdatePriority: scheduling.writeCurrentUpdatePriority,
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
