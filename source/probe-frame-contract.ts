import React from 'react';
import type { ProbeError, ProbeNotRenderedReason } from './probe-public-types.ts';
import { assertSupportedReactValue } from './probe-unsupported-react.ts';

export const probeComponentHostType = 'react-probe-internal-component';
export const probeEmptyHostType = 'react-probe-internal-empty';
export const probeOpaqueHostType = 'react-probe-internal-opaque';

export const probeComponentMetadata = '__reactProbeComponentMetadata';
export const probeElementKeyMetadata = '__reactProbeElementKeyMetadata';
export const probeValueMetadata = '__reactProbeValueMetadata';

export type ProbeFrameDepth = number | 'full';

export type ProbeElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

export type ProbeTransformedNode = Readonly<React.ReactElement> | number | string | readonly ProbeTransformedNode[];

export type ProbeComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly error: ProbeError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly type: unknown;
};

const probeRenderErrors = new WeakSet();

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== probeElementKeyMetadata;
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

export function readElementProps(element: ProbeElement): Readonly<Record<PropertyKey, unknown>> {
    return element.props;
}

export function readElementRef(element: ProbeElement): unknown {
    return readElementProps(element).ref;
}

export function nextDepth(depth: ProbeFrameDepth): ProbeFrameDepth {
    return depth === 'full' ? depth : Math.max(0, depth - 1);
}

export function createComponentMetadata(
    element: ProbeElement,
    renderedReason: ProbeNotRenderedReason | undefined,
    error?: ProbeError,
    activityMode?: 'hidden' | 'visible'
): ProbeComponentMetadata {
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
    metadata: ProbeComponentMetadata,
    children: ProbeTransformedNode
): React.ReactElement {
    return React.createElement(
        probeComponentHostType,
        {
            [probeComponentMetadata]: metadata
        },
        children
    );
}

export function createEmptyHost(value: unknown): React.ReactElement {
    return React.createElement(probeEmptyHostType, {
        [probeValueMetadata]: value
    });
}

export function throwProbeRenderError(error: unknown): never {
    if (isRecord(error) && !isThenable(error)) {
        probeRenderErrors.add(error);
    }

    throw error;
}

export function isProbeRenderError(error: unknown): boolean {
    return isRecord(error) && probeRenderErrors.has(error);
}
