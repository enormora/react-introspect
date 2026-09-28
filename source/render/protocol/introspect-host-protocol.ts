import React from 'react';
import type { IntrospectionError, IntrospectionNotRenderedReason } from '../../public/introspect-public-types.ts';
import { assertSupportedReactValue } from '../../values/introspect-unsupported-react.ts';
import { isObjectOrFunction } from '../../values/introspect-value-kinds.ts';

type EncodedElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

const introspectionComponentHostType = 'react-introspect-internal-component';
const introspectionEmptyHostType = 'react-introspect-internal-empty';
const introspectionOpaqueHostType = 'react-introspect-internal-opaque';

const introspectionComponentMetadata = '__reactIntrospectionComponentMetadata';
const introspectionElementKeyMetadata = '__reactIntrospectionElementKeyMetadata';
const introspectionValueMetadata = '__reactIntrospectionValueMetadata';

export type IntrospectionComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: unknown;
};

type ComponentHost = { readonly kind: 'component'; readonly metadata: IntrospectionComponentMetadata; };

type ValueHost = { readonly kind: 'empty' | 'opaque'; readonly value: unknown; };

export type InternalHost = ComponentHost | ValueHost | { readonly kind: 'host'; };

const internalHostTypes = new Set([
    introspectionComponentHostType,
    introspectionEmptyHostType,
    introspectionOpaqueHostType
]);
const createdComponentMetadata = new WeakSet();
const unsupportedComponentMetadata: IntrospectionComponentMetadata = {
    activityMode: undefined,
    caughtError: undefined,
    givenChildren: undefined,
    key: null,
    props: {},
    renderedReason: 'unsupported',
    type: introspectionComponentHostType
};

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== introspectionElementKeyMetadata;
}

function filterProps(
    props: Readonly<Record<PropertyKey, unknown>>,
    isKept: (key: PropertyKey) => boolean
): Record<PropertyKey, unknown> {
    const result: Record<PropertyKey, unknown> = {};

    for (const key of Reflect.ownKeys(props)) {
        if (isKept(key)) {
            result[key] = props[key];
        }
    }

    return result;
}

export type ComponentMetadataRequest = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly element: EncodedElement;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
};

export function createComponentMetadata(request: ComponentMetadataRequest): IntrospectionComponentMetadata {
    const { activityMode, caughtError, element, renderedReason } = request;
    const { props } = element;

    assertSupportedReactValue(props.children);

    const metadata: IntrospectionComponentMetadata = {
        activityMode,
        caughtError,
        givenChildren: props.children,
        key: element.key,
        props: filterProps(props, isPublicPropKey),
        renderedReason,
        type: element.type
    };

    createdComponentMetadata.add(metadata);

    return metadata;
}

export function createComponentHost(
    metadata: IntrospectionComponentMetadata,
    children: React.ReactNode
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

export function createOpaqueHost(value: unknown): React.ReactElement {
    return React.createElement(introspectionOpaqueHostType, {
        [introspectionValueMetadata]: value
    });
}

export function elementKeyProps(element: EncodedElement): Readonly<Record<PropertyKey, unknown>> {
    return { [introspectionElementKeyMetadata]: element.key };
}

function isPublicHostPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== introspectionComponentMetadata &&
        key !== introspectionElementKeyMetadata &&
        key !== introspectionValueMetadata;
}

function isIntrospectionComponentMetadata(value: unknown): value is IntrospectionComponentMetadata {
    return isObjectOrFunction(value) && createdComponentMetadata.has(value);
}

function readComponentMetadata(props: Readonly<Record<PropertyKey, unknown>>): IntrospectionComponentMetadata {
    const value = props[introspectionComponentMetadata];

    return isIntrospectionComponentMetadata(value) ? value : unsupportedComponentMetadata;
}

export function isInternalHostType(type: string): boolean {
    return internalHostTypes.has(type);
}

export function readInternalHost(type: string, props: Readonly<Record<PropertyKey, unknown>>): InternalHost {
    if (type === introspectionEmptyHostType) {
        return { kind: 'empty', value: props[introspectionValueMetadata] };
    }

    if (type === introspectionOpaqueHostType) {
        return { kind: 'opaque', value: props[introspectionValueMetadata] };
    }

    if (type === introspectionComponentHostType) {
        return { kind: 'component', metadata: readComponentMetadata(props) };
    }

    return { kind: 'host' };
}

export function readPublicHostProps(
    props: Readonly<Record<PropertyKey, unknown>>
): Readonly<Record<PropertyKey, unknown>> {
    return Object.freeze(filterProps(props, isPublicHostPropKey));
}

export function readHostKey(props: Readonly<Record<PropertyKey, unknown>>): string | null {
    const key = props[introspectionElementKeyMetadata];

    return typeof key === 'string' ? key : null;
}
