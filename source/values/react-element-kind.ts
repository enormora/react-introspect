import React from 'react';
import { type IntrospectionClassComponent, isClassComponent } from './class-component.ts';
import { shallowEquals } from './shallow-equality.ts';
import { isObjectOrFunction } from './value-kinds.ts';

type PropsRecord = Readonly<Record<PropertyKey, unknown>>;

type ForwardRefRender = (props: PropsRecord, ref: unknown) => React.ReactNode;

type FunctionComponentType = ((props: PropsRecord) => React.ReactNode) & { readonly name: string; };

type BuiltInMarkerName = 'activity' | 'fragment' | 'profiler' | 'strictMode' | 'suspense' | 'viewTransition';

type MarkerKind = { readonly kind: BuiltInMarkerName | 'context' | 'other'; };

type ForwardRefKind = {
    readonly kind: 'forwardRef';
    readonly type: PropsRecord;
    readonly displayName: string | undefined;
    readonly render: ForwardRefRender;
};

type ClassKind = { readonly kind: 'class'; readonly component: IntrospectionClassComponent; };

type FunctionKind = { readonly kind: 'function'; readonly component: FunctionComponentType; };

type HostKind = { readonly kind: 'host'; readonly name: string; };

type LazyKind = {
    readonly kind: 'lazy';
    readonly initialize: () => unknown;
    readonly resolved: unknown;
    readonly type: PropsRecord;
};

type MemoCompare = (previous: PropsRecord, next: PropsRecord) => boolean;

type MemoKind = {
    readonly kind: 'memo';
    readonly type: PropsRecord;
    readonly compare: MemoCompare;
    readonly displayName: string | undefined;
    readonly inner: unknown;
};

type ConsumerKind = { readonly kind: 'consumer'; readonly context: React.Context<unknown>; };

type WrapperElementKind = ForwardRefKind | LazyKind | MemoKind;

export type ReactElementKind = ClassKind | ConsumerKind | FunctionKind | HostKind | MarkerKind | WrapperElementKind;

export type ReactElementKindByName = {
    readonly [Kind in ReactElementKind as Kind['kind']]: Kind;
};

const memoType = Symbol.for('react.memo');
const forwardRefType = Symbol.for('react.forward_ref');
const lazyType = Symbol.for('react.lazy');
const contextType = Symbol.for('react.context');
const builtInMarkerNames = new Map<unknown, BuiltInMarkerName>([
    [ React.Fragment, 'fragment' ],
    [ React.Profiler, 'profiler' ],
    [ React.StrictMode, 'strictMode' ],
    [ React.Suspense, 'suspense' ],
    [ Symbol.for('react.activity'), 'activity' ],
    [ Symbol.for('react.view_transition'), 'viewTransition' ]
]);
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

export function hasReactTypeMarker(value: PropsRecord): boolean {
    return Object.hasOwn(value, '$$typeof');
}

export function readDisplayName(type: PropsRecord): string | undefined {
    const { displayName } = type;

    return typeof displayName === 'string' && displayName !== '' ? displayName : undefined;
}

function isMemoCompare(value: unknown): value is MemoCompare {
    return typeof value === 'function';
}

function readMemoKind(type: unknown): ReactElementKind | undefined {
    if (!hasReactType(type, memoType) || !Object.hasOwn(type, 'type')) {
        return undefined;
    }

    const ownCompare = isMemoCompare(type.compare) ? type.compare : shallowEquals;
    const innerKind = readMemoKind(type.type);

    return {
        compare: innerKind?.kind === 'memo'
            ? function compareEitherMemoLevel(previous, next) {
                return ownCompare(previous, next) || innerKind.compare(previous, next);
            }
            : ownCompare,
        displayName: readDisplayName(type),
        inner: type.type,
        kind: 'memo',
        type
    };
}

function readForwardRefKind(type: unknown): ReactElementKind | undefined {
    if (!hasReactType(type, forwardRefType) || !Object.hasOwn(type, 'render')) {
        return undefined;
    }

    const { render } = type;

    return isForwardRefRender(render)
        ? { displayName: readDisplayName(type), kind: 'forwardRef', render, type }
        : undefined;
}

const lazyStatusKey = '_status';
const lazyResultKey = '_result';
const resolvedLazyStatus = 1;

function readResolvedLazyType(payload: unknown): unknown {
    if (!isObjectOrFunction(payload) || payload[lazyStatusKey] !== resolvedLazyStatus) {
        return undefined;
    }

    const moduleObject = payload[lazyResultKey];

    return isObjectOrFunction(moduleObject) ? moduleObject.default : undefined;
}

const resolvedLazyTypes = new WeakMap<WeakKey, unknown>();

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

            resolvedLazyTypes.set(type, resolved);

            return resolved;
        },
        kind: 'lazy',
        resolved: resolvedLazyTypes.get(type) ?? readResolvedLazyType(Reflect.get(type, lazyPayloadKey)),
        type
    };
}

function readBuiltInKind(type: unknown): ReactElementKind | undefined {
    if (typeof type === 'string') {
        return { kind: 'host', name: type };
    }

    const markerName = builtInMarkerNames.get(type);

    return markerName === undefined ? undefined : { kind: markerName };
}

const consumerType = Symbol.for('react.consumer');
const consumerContextKey = '_context';

function isReactContext(value: unknown): value is React.Context<unknown> {
    return hasReactType(value, contextType);
}

function readConsumerKind(type: unknown): ReactElementKind | undefined {
    if (!hasReactType(type, consumerType)) {
        return undefined;
    }

    const context = type[consumerContextKey];

    return isReactContext(context) ? { context, kind: 'consumer' } : undefined;
}

function readContextElementKind(type: unknown): ReactElementKind | undefined {
    return hasReactType(type, contextType) ? { kind: 'context' } : readConsumerKind(type);
}

function readComponentKind(type: unknown): ReactElementKind {
    if (isClassComponent(type)) {
        return { component: type, kind: 'class' };
    }

    return isFunctionComponentType(type) ? { component: type, kind: 'function' } : { kind: 'other' };
}

export function classifyElementType(type: unknown): ReactElementKind {
    return readBuiltInKind(type) ??
        readLazyKind(type) ??
        readMemoKind(type) ??
        readForwardRefKind(type) ??
        readContextElementKind(type) ??
        readComponentKind(type);
}
