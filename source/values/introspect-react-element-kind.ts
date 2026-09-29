import React from 'react';
import { isObjectOrFunction } from './introspect-value-kinds.ts';

type PropsRecord = Readonly<Record<PropertyKey, unknown>>;

type ForwardRefRender = (props: PropsRecord, ref: unknown) => React.ReactNode;

type FunctionComponentType = ((props: PropsRecord) => React.ReactNode) & { readonly name: string; };

type MarkerKind = { readonly kind: 'activity' | 'context' | 'fragment' | 'other' | 'suspense' | 'viewTransition'; };

type ForwardRefKind = { readonly kind: 'forwardRef'; readonly render: ForwardRefRender; };

type FunctionKind = { readonly kind: 'function'; readonly component: FunctionComponentType; };

type HostKind = { readonly kind: 'host'; readonly name: string; };

type LazyKind = { readonly kind: 'lazy'; readonly initialize: () => unknown; };

type MemoKind = { readonly kind: 'memo'; readonly inner: unknown; };

export type ReactElementKind = ForwardRefKind | FunctionKind | HostKind | LazyKind | MarkerKind | MemoKind;

const memoType = Symbol.for('react.memo');
const forwardRefType = Symbol.for('react.forward_ref');
const lazyType = Symbol.for('react.lazy');
const contextType = Symbol.for('react.context');
const activityType: unknown = Symbol.for('react.activity');
const viewTransitionType: unknown = Symbol.for('react.view_transition');
const lazyInitializerKey = '_init';
const lazyPayloadKey = '_payload';

function isForwardRefRender(value: unknown): value is ForwardRefRender {
    return typeof value === 'function';
}

function isFunctionComponentType(value: unknown): value is FunctionComponentType {
    return typeof value === 'function';
}

function hasReactType(value: unknown, type: symbol): value is PropsRecord {
    return isObjectOrFunction(value) && value.$$typeof === type;
}

function readMemoKind(type: unknown): ReactElementKind | undefined {
    return hasReactType(type, memoType) && Object.hasOwn(type, 'type') ? { inner: type.type, kind: 'memo' } : undefined;
}

function readForwardRefKind(type: unknown): ReactElementKind | undefined {
    if (!hasReactType(type, forwardRefType) || !Object.hasOwn(type, 'render')) {
        return undefined;
    }

    const { render } = type;

    return isForwardRefRender(render) ? { kind: 'forwardRef', render } : undefined;
}

function readLazyKind(type: unknown): ReactElementKind | undefined {
    const isLazy = hasReactType(type, lazyType) &&
        Object.hasOwn(type, lazyInitializerKey) &&
        Object.hasOwn(type, lazyPayloadKey);

    if (!isLazy) {
        return undefined;
    }

    const initializer: unknown = Reflect.get(type, lazyInitializerKey);

    if (typeof initializer !== 'function') {
        return undefined;
    }

    return {
        initialize() {
            const resolved: unknown = Reflect.apply(initializer, undefined, [ Reflect.get(type, lazyPayloadKey) ]);

            return resolved;
        },
        kind: 'lazy'
    };
}

function readBuiltInKind(type: unknown): ReactElementKind | undefined {
    if (typeof type === 'string') {
        return { kind: 'host', name: type };
    }

    if (type === React.Fragment) {
        return { kind: 'fragment' };
    }

    if (type === React.Suspense) {
        return { kind: 'suspense' };
    }

    if (type === activityType) {
        return { kind: 'activity' };
    }

    return type === viewTransitionType ? { kind: 'viewTransition' } : undefined;
}

function readContextKind(type: unknown): ReactElementKind | undefined {
    return hasReactType(type, contextType) ? { kind: 'context' } : undefined;
}

function readComponentKind(type: unknown): ReactElementKind {
    return isFunctionComponentType(type) ? { component: type, kind: 'function' } : { kind: 'other' };
}

export function classifyElementType(type: unknown): ReactElementKind {
    return readBuiltInKind(type) ??
        readLazyKind(type) ??
        readMemoKind(type) ??
        readForwardRefKind(type) ??
        readContextKind(type) ??
        readComponentKind(type);
}

const reactReservedPropKeys = new Set<PropertyKey>([ 'children', 'key', 'ref' ]);

export function isReactReservedPropKey(key: PropertyKey): boolean {
    return reactReservedPropKeys.has(key);
}
