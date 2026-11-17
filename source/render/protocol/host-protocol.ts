import React from 'react';
import type { IntrospectionError, IntrospectionNotRenderedReason } from '../../public/public-types.ts';
import { assertSupportedReactValue } from '../../react-elements/unsupported-react.ts';
import { readPublicProps } from '../../react-elements/public-props.ts';
import { isObjectOrFunction } from '../../values/value-kinds.ts';

type EncodedElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

const introspectionComponentHostType = 'react-introspect-internal-component';
const introspectionEmptyHostType = 'react-introspect-internal-empty';
const introspectionOpaqueHostType = 'react-introspect-internal-opaque';

const introspectionComponentMetadata = '__reactIntrospectionComponentMetadata';
const introspectionElementKeyMetadata = '__reactIntrospectionElementKeyMetadata';
const introspectionValueMetadata = '__reactIntrospectionValueMetadata';

type ComponentNotRenderedStatus = { readonly reason: IntrospectionNotRenderedReason; readonly status: 'notRendered'; };

type ComponentRenderedStatus = { readonly status: 'rendered'; };

type ComponentRenderStatus = ComponentNotRenderedStatus | ComponentRenderedStatus;

const renderedStatus: ComponentRenderedStatus = { status: 'rendered' };

type IntrospectionComponentMetadata = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderStatus: ComponentRenderStatus;
    readonly type: unknown;
};

type ComponentHost = { readonly kind: 'component'; readonly metadata: IntrospectionComponentMetadata; };

type ValueHost = { readonly kind: 'empty' | 'opaque'; readonly value: unknown; };

export type InternalHost = ComponentHost | ValueHost | { readonly kind: 'host'; };

const createdComponentMetadata = new WeakSet();
const unsupportedComponentMetadata: IntrospectionComponentMetadata = {
    activityMode: undefined,
    caughtError: undefined,
    givenChildren: undefined,
    key: null,
    props: {},
    renderStatus: { reason: 'unsupported', status: 'notRendered' },
    type: introspectionComponentHostType
};

const internalPropKeys = new Set<PropertyKey>([
    introspectionComponentMetadata,
    introspectionElementKeyMetadata,
    introspectionValueMetadata
]);

type ComponentMetadataRequest = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly element: EncodedElement;
    readonly renderStatus: ComponentRenderStatus;
};

function createComponentMetadata(request: ComponentMetadataRequest): IntrospectionComponentMetadata {
    const { activityMode, caughtError, element, renderStatus } = request;
    const { props } = element;

    assertSupportedReactValue(props.children);

    const metadata: IntrospectionComponentMetadata = {
        activityMode,
        caughtError,
        givenChildren: props.children,
        key: element.key,
        props: readPublicProps(props, internalPropKeys),
        renderStatus,
        type: element.type
    };

    createdComponentMetadata.add(metadata);

    return metadata;
}

function createComponentHost(
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

export function createExecutedComponentHost(element: EncodedElement, children: React.ReactNode): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element,
            renderStatus: renderedStatus
        }),
        children
    );
}

export function createActivityComponentHost(
    element: EncodedElement,
    activityMode: 'hidden' | 'visible',
    children: React.ReactNode
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({ activityMode, caughtError: undefined, element, renderStatus: renderedStatus }),
        children
    );
}

export function createCaughtErrorComponentHost(
    element: EncodedElement,
    caughtError: IntrospectionError,
    children: React.ReactNode
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({ activityMode: undefined, caughtError, element, renderStatus: renderedStatus }),
        children
    );
}

export function createUnexecutedComponentHost(
    element: EncodedElement,
    reason: IntrospectionNotRenderedReason
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element,
            renderStatus: { reason, status: 'notRendered' }
        }),
        createEmptyHost(undefined)
    );
}

export function createOpaqueHost(value: unknown): React.ReactElement {
    return React.createElement(introspectionOpaqueHostType, {
        [introspectionValueMetadata]: value
    });
}

export function elementKeyProps(element: EncodedElement): Readonly<Record<PropertyKey, unknown>> {
    return { [introspectionElementKeyMetadata]: element.key };
}

function isIntrospectionComponentMetadata(value: unknown): value is IntrospectionComponentMetadata {
    return isObjectOrFunction(value) && createdComponentMetadata.has(value);
}

function readComponentMetadata(props: Readonly<Record<PropertyKey, unknown>>): IntrospectionComponentMetadata {
    const value = props[introspectionComponentMetadata];

    return isIntrospectionComponentMetadata(value) ? value : unsupportedComponentMetadata;
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
    return readPublicProps(props, internalPropKeys);
}

export function readHostKey(props: Readonly<Record<PropertyKey, unknown>>): string | null {
    const key = props[introspectionElementKeyMetadata];

    return typeof key === 'string' ? key : null;
}
