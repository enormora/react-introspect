import type React from 'react';
import { isObjectOrFunction } from './introspect-value-kinds.ts';

export type IntrospectionClassUpdater = {
    readonly enqueueForceUpdate: (
        instance: unknown,
        callback: (() => void) | undefined
    ) => void;
    readonly enqueueSetState: (
        instance: unknown,
        state: unknown,
        callback: (() => void) | undefined
    ) => void;
};

export type IntrospectionClassInstance = React.Component<Readonly<Record<PropertyKey, unknown>>, unknown> & {
    readonly componentDidCatch?: (error: unknown, errorInfo: unknown) => void;
    readonly componentDidMount?: () => void;
    readonly componentDidUpdate?: (props: unknown, state: unknown, snapshot: unknown) => void;
    readonly componentWillUnmount?: () => void;
    readonly context: unknown;
    readonly getSnapshotBeforeUpdate?: (props: unknown, state: unknown) => unknown;
    readonly isPureReactComponent?: boolean;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly refs: Readonly<Record<PropertyKey, unknown>>;
    readonly render: () => React.ReactNode;
    readonly shouldComponentUpdate?: (props: unknown, state: unknown, context: unknown) => boolean;
    readonly state: unknown;
    readonly updater: IntrospectionClassUpdater;
};

export type IntrospectionClassComponent = {
    readonly name: string;
    readonly getDerivedStateFromError?: (error: unknown) => unknown;
    readonly getDerivedStateFromProps?: (
        props: Readonly<Record<PropertyKey, unknown>>,
        state: unknown
    ) => unknown;
    readonly prototype: {
        readonly componentDidCatch?: (error: unknown, errorInfo: unknown) => void;
        readonly isReactComponent?: unknown;
    };
    new (
        props: Readonly<Record<PropertyKey, unknown>>,
        context: unknown
    ): IntrospectionClassInstance;
};

export function isClassComponent(value: unknown): value is IntrospectionClassComponent {
    const prototype: unknown = typeof value === 'function' ? Reflect.get(value, 'prototype') : undefined;

    return isObjectOrFunction(prototype) && prototype.isReactComponent !== undefined;
}
