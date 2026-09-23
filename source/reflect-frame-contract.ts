import React from 'react';
import type { ReflectError, ReflectNotRenderedReason } from './reflect-public-types.ts';
import { assertSupportedReactValue } from './reflect-unsupported-react.ts';

export const reflectComponentHostType = 'react-reflect-internal-component';
export const reflectEmptyHostType = 'react-reflect-internal-empty';
export const reflectOpaqueHostType = 'react-reflect-internal-opaque';

export const reflectComponentMetadata = '__reactReflectComponentMetadata';
export const reflectElementKeyMetadata = '__reactReflectElementKeyMetadata';
export const reflectValueMetadata = '__reactReflectValueMetadata';

export type ReflectFrameDepth = number | 'full';

export type ReflectElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

export type ReflectTransformedNode = Readonly<React.ReactElement> | number | string | readonly ReflectTransformedNode[];

export type ReflectComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly error: ReflectError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: ReflectNotRenderedReason | undefined;
    readonly type: unknown;
};

const reflectRenderErrors = new WeakSet();

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== reflectElementKeyMetadata;
}

function isThenable(value: unknown): boolean {
    return isRecord(value) && typeof Reflect.get(value, 'then') === 'function';
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

export function readElementProps(element: ReflectElement): Readonly<Record<PropertyKey, unknown>> {
    return element.props;
}

export function readElementRef(element: ReflectElement): unknown {
    return readElementProps(element).ref;
}

export function nextDepth(depth: ReflectFrameDepth): ReflectFrameDepth {
    return depth === 'full' ? depth : Math.max(0, depth - 1);
}

export function createComponentMetadata(
    element: ReflectElement,
    renderedReason: ReflectNotRenderedReason | undefined,
    error?: ReflectError,
    activityMode?: 'hidden' | 'visible'
): ReflectComponentMetadata {
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
    metadata: ReflectComponentMetadata,
    children: ReflectTransformedNode
): React.ReactElement {
    return React.createElement(
        reflectComponentHostType,
        {
            [reflectComponentMetadata]: metadata
        },
        children
    );
}

export function createEmptyHost(value: unknown): React.ReactElement {
    return React.createElement(reflectEmptyHostType, {
        [reflectValueMetadata]: value
    });
}

export function throwReflectRenderError(error: unknown): never {
    if (isRecord(error) && !isThenable(error)) {
        reflectRenderErrors.add(error);
    }

    throw error;
}

export function isReflectRenderError(error: unknown): boolean {
    return isRecord(error) && reflectRenderErrors.has(error);
}
