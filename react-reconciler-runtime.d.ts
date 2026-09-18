declare module 'react-reconciler' {
    type ReconcilerRoot = Record<string, unknown>;

    type ReconcilerInstance = {
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

    export default function createReconciler(hostConfiguration: unknown): ReconcilerInstance;
}
