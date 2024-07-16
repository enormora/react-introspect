/* eslint-disable no-console -- wip */
import type { ReactElement } from 'react';
import createReconciler, { type HostConfig } from 'react-reconciler';
import { ConcurrentRoot, DefaultEventPriority } from 'react-reconciler/constants.js';

type MyTestInstance<Props = Record<string, unknown>> = {
    type: string;
    props: Props;
    children: MyTestInstance[];
};

type HostContainer = {
    head: MyTestInstance | null;
};

type MyHostConfig = HostConfig<
    string,
    Record<string, unknown>,
    HostContainer,
    MyTestInstance,
    MyTestInstance,
    MyTestInstance,
    never,
    null,
    null,
    Record<never, unknown>,
    never,
    number,
    -1
>;

export function createRenderer(element: ReactElement): void {
    const hostConfig: MyHostConfig = {
        /* now: Date.now, */

        supportsMutation: true,
        supportsPersistence: false,
        noTimeout: -1,
        isPrimaryRenderer: true,
        supportsHydration: false,

        getPublicInstance() {
            console.log('getPublicInstance() called');
            return null;
        },

        preparePortalMount() {
            console.log('preparePortalMount() called');
        },

        scheduleTimeout() {
            console.log('scheduleTimeout() called');
            return 42;
        },

        cancelTimeout() {
            console.log('cancelTimeout() called');
        },

        detachDeletedInstance() {
            console.log('detachDeletedInstance() called');
        },

        getInstanceFromScope() {
            console.log('getInstanceFromScope() called');
            return null;
        },

        prepareScopeUpdate() {
            console.log('prepareScopeUpdate() called');
        },

        beforeActiveInstanceBlur() {
            console.log('beforeActiveInstanceBlur() called');
        },

        afterActiveInstanceBlur() {
            console.log('afterActiveInstanceBlur() called');
        },

        getInstanceFromNode() {
            console.log('getInstanceFromNode() called');
            return null;
        },

        getCurrentEventPriority() {
            console.log('getCurrentEventPriority() called');
            return DefaultEventPriority;
        },

        getRootHostContext() {
            console.log('getRootHostContext() called');
            return null;
        },

        prepareForCommit() {
            console.log('prepareForCommit() called');

            return null;
        },

        resetAfterCommit() {
            console.log('resetAfterCommit() called');
        },

        getChildHostContext(parentHostContext) {
            console.log('getChildHostContext() called');
            return parentHostContext;
        },

        shouldSetTextContent(_type, props) {
            console.log('shouldSetTextContent() called');
            return typeof props.children === 'string' || typeof props.children === 'number';
        },

        createInstance(type, props) {
            console.log('createInstance() called');
            return { type, props, children: [] };
        },

        createTextInstance(text) {
            console.log('createTextInstance() called');
            return { type: 'text', props: { text }, children: [] };
        },

        appendInitialChild() {
            console.log('appendInitialChild() called');
        },

        appendChild() {
            console.log('appendChild() called');
        },

        finalizeInitialChildren() {
            console.log('finalizeInitialChildren() called');
            return true;
        },

        appendChildToContainer() {
            console.log('appendChildToContainer() called');
        },

        prepareUpdate() {
            console.log('prepareUpdate() called');
            return true;
        },

        commitUpdate() {
            console.log('commitUpdate() called');
        },

        commitTextUpdate() {
            console.log('commitTextUpdate() called');
        },

        removeChild() {
            console.log('removeChild() called');
        },

        clearContainer() {
            console.log('clearContainer() called');
        },

        commitMount() {
            console.log('commitMount() called');
        }
    };

    const reconciler = createReconciler(hostConfig);
    const rootContainer = reconciler.createContainer(
        { head: null },
        ConcurrentRoot,
        null,
        false,
        null,
        '',
        console.error,
        null
    ) as unknown;
    reconciler.updateContainer(element, rootContainer, null);
}
