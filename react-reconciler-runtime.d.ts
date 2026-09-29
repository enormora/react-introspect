declare module 'react-reconciler' {
    export type ReconcilerRoot = Record<string, unknown>;

    export type ReconcilerInstance = {
        readonly createContainer: (
            containerInfo: unknown,
            tag: number,
            hydrationCallbacks: null,
            isStrictMode: boolean,
            concurrentUpdatesByDefaultOverride: null,
            identifierPrefix: string,
            onUncaughtError: (error: unknown) => void,
            onCaughtError: (error: unknown) => void,
            onRecoverableError: (error: unknown) => void,
            onDefaultTransitionIndicator: null
        ) => ReconcilerRoot;
        readonly flushPassiveEffects: () => boolean;
        readonly flushSyncFromReconciler: <Result>(action: () => Result) => Result;
        readonly flushSyncWork: () => boolean;
        readonly updateContainer: (
            element: unknown,
            container: ReconcilerRoot,
            parentComponent: null,
            callback: (() => void) | null
        ) => number;
    };

    export type HostConfig<Instance, TextInstance, Container, Props, HostContext> = {
        readonly appendChild: (parent: Instance, child: Instance | TextInstance) => void;
        readonly appendChildToContainer: (container: Container, child: Instance | TextInstance) => void;
        readonly appendInitialChild: (parent: Instance, child: Instance | TextInstance) => void;
        readonly clearContainer: (container: Container) => void;
        readonly commitTextUpdate: (textInstance: TextInstance, oldText: string, newText: string) => void;
        readonly commitUpdate: (
            instance: Instance,
            type: string,
            oldProps: Props,
            newProps: Props,
            fiber: unknown
        ) => void;
        readonly createInstance: (
            type: string,
            props: Props,
            rootContainer: Container,
            hostContext: HostContext,
            fiber: unknown
        ) => Instance;
        readonly createTextInstance: (
            text: string,
            rootContainer: Container,
            hostContext: HostContext,
            fiber: unknown
        ) => TextInstance;
        readonly finalizeInitialChildren: (
            instance: Instance,
            type: string,
            props: Props,
            hostContext: HostContext
        ) => boolean;
        readonly getChildHostContext: (parentHostContext: HostContext, type: string) => HostContext;
        readonly getPublicInstance: (instance: Instance) => unknown;
        readonly getRootHostContext: (rootContainer: Container) => HostContext;
        readonly hideInstance: (instance: Instance) => void;
        readonly hideTextInstance: (textInstance: TextInstance) => void;
        readonly insertBefore: (parent: Instance, child: Instance | TextInstance, before: Instance | TextInstance) => void;
        readonly insertInContainerBefore: (
            container: Container,
            child: Instance | TextInstance,
            before: Instance | TextInstance
        ) => void;
        readonly prepareForCommit: (container: Container) => null;
        readonly removeChild: (parent: Instance, child: Instance | TextInstance) => void;
        readonly removeChildFromContainer: (container: Container, child: Instance | TextInstance) => void;
        readonly resetAfterCommit: (container: Container) => void;
        readonly unhideInstance: (instance: Instance, props: Props) => void;
        readonly unhideTextInstance: (textInstance: TextInstance, text: string) => void;
        readonly [member: string]: unknown;
    };

    export default function createReconciler<Instance, TextInstance, Container, Props, HostContext>(
        hostConfiguration: HostConfig<Instance, TextInstance, Container, Props, HostContext>
    ): ReconcilerInstance;
}
