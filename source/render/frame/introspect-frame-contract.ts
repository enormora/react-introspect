import React from 'react';
import type { IntrospectionError, IntrospectionNotRenderedReason } from '../../public/introspect-public-types.ts';
import { isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import { assertSupportedReactValue } from './introspect-unsupported-react.ts';

export const introspectionComponentHostType = 'react-introspect-internal-component';
export const introspectionEmptyHostType = 'react-introspect-internal-empty';
export const introspectionOpaqueHostType = 'react-introspect-internal-opaque';

export const introspectionComponentMetadata = '__reactIntrospectionComponentMetadata';
export const introspectionElementKeyMetadata = '__reactIntrospectionElementKeyMetadata';
export const introspectionValueMetadata = '__reactIntrospectionValueMetadata';

type IntrospectionDepthBudget = number | 'full';

type IntrospectionDepthPolicy = {
    readonly depthFrom: unknown;
    readonly transparent: ReadonlySet<unknown>;
};

export type IntrospectionFrameDepth = {
    readonly budget: IntrospectionDepthBudget;
    readonly counting: boolean;
    readonly policy: IntrospectionDepthPolicy;
};

export type IntrospectionDepthOptions = {
    readonly budget: IntrospectionDepthBudget;
    readonly depthFrom: unknown;
    readonly transparent: readonly unknown[];
};

export type IntrospectionElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

type TransformedElement = Readonly<React.ReactElement>;
type TransformedChildren = readonly IntrospectionTransformedNode[];

export type IntrospectionTransformedNode = TransformedChildren | TransformedElement | number | string;

export type IntrospectionComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly error: IntrospectionError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: unknown;
};

const introspectionRenderErrors = new WeakSet();

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== introspectionElementKeyMetadata;
}

function publicProps(props: Readonly<Record<PropertyKey, unknown>>): Readonly<Record<PropertyKey, unknown>> {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isPublicPropKey(key)) {
            result[key] = props[key];
        }
    }

    return Object.freeze(result);
}

export function readElementProps(element: IntrospectionElement): Readonly<Record<PropertyKey, unknown>> {
    return element.props;
}

export function readElementRef(element: IntrospectionElement): unknown {
    return readElementProps(element).ref;
}

export function createFrameDepth(options: IntrospectionDepthOptions): IntrospectionFrameDepth {
    return Object.freeze({
        budget: options.budget,
        counting: options.depthFrom === undefined,
        policy: Object.freeze({
            depthFrom: options.depthFrom,
            transparent: new Set(options.transparent)
        })
    });
}

export function enterComponentDepth(depth: IntrospectionFrameDepth, type: unknown): IntrospectionFrameDepth {
    return !depth.counting && type === depth.policy.depthFrom ? Object.freeze({ ...depth, counting: true }) : depth;
}

function consumesDepth(depth: IntrospectionFrameDepth, type: unknown): boolean {
    return depth.counting && !depth.policy.transparent.has(type);
}

export function canExecuteComponent(depth: IntrospectionFrameDepth, type: unknown): boolean {
    return !consumesDepth(depth, type) || depth.budget === 'full' || depth.budget > 0;
}

export function nextDepth(depth: IntrospectionFrameDepth, type: unknown): IntrospectionFrameDepth {
    if (!consumesDepth(depth, type) || depth.budget === 'full') {
        return depth;
    }

    return Object.freeze({ ...depth, budget: Math.max(0, depth.budget - 1) });
}

export function createComponentMetadata(
    element: IntrospectionElement,
    renderedReason: IntrospectionNotRenderedReason | undefined,
    error?: IntrospectionError,
    activityMode?: 'hidden' | 'visible'
): IntrospectionComponentMetadata {
    const props = readElementProps(element);

    assertSupportedReactValue(props.children);

    return Object.freeze({
        activityMode,
        error,
        givenChildren: props.children,
        key: element.key,
        props: publicProps(props),
        renderedReason,
        type: element.type
    });
}

export function createComponentHost(
    metadata: IntrospectionComponentMetadata,
    children: IntrospectionTransformedNode
): React.ReactElement {
    return React.createElement(
        introspectionComponentHostType,
        {
            [introspectionComponentMetadata]: metadata
        },
        children
    );
}

export function createEmptyHost(value: unknown): React.ReactElement {
    return React.createElement(introspectionEmptyHostType, {
        [introspectionValueMetadata]: value
    });
}

export function throwIntrospectionRenderError(error: unknown): never {
    if (isObjectOrFunction(error) && !isThenable(error)) {
        introspectionRenderErrors.add(error);
    }

    throw error;
}

export function isIntrospectionRenderError(error: unknown): boolean {
    return isObjectOrFunction(error) && introspectionRenderErrors.has(error);
}
