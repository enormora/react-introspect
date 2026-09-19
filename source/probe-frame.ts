import React from 'react';
import type { ProbeNotRenderedReason } from './probe-public-types.ts';

export const probeComponentHostType = 'react-probe-internal-component';
export const probeEmptyHostType = 'react-probe-internal-empty';
export const probeOpaqueHostType = 'react-probe-internal-opaque';

export const probeComponentMetadata = '__reactProbeComponentMetadata';
export const probeElementKeyMetadata = '__reactProbeElementKeyMetadata';
export const probeValueMetadata = '__reactProbeValueMetadata';

export type ProbeFrameDepth = number | 'full';

export type ProbeComponentMetadata = {
    readonly givenChildren: unknown;
    readonly key: string | null;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedReason: ProbeNotRenderedReason | undefined;
    readonly type: unknown;
};

type ProbeFrameProps = {
    readonly createFrameElement: ProbeFrameElementFactory;
    readonly depth: ProbeFrameDepth;
    readonly element: ProbeElement;
};

type ProbeFrameType = {
    readonly $$typeof: symbol;
};

type ProbeMemoType = ProbeFrameType & {
    readonly type: unknown;
};

type ProbeForwardRefType = ProbeFrameType & {
    readonly render: (props: Readonly<Record<PropertyKey, unknown>>, ref: unknown) => React.ReactNode;
};

type ProbeElement = React.ReactElement<Readonly<Record<PropertyKey, unknown>>>;

type ProbeFunctionComponent = (props: Readonly<Record<PropertyKey, unknown>>) => React.ReactNode;

type ProbeFrameElementFactory = (element: ProbeElement, depth: ProbeFrameDepth) => React.ReactElement;

type ProbeTransformedNode = Readonly<React.ReactElement> | number | string | readonly ProbeTransformedNode[];

type ProbeTransformNode = (
    node: unknown,
    depth: ProbeFrameDepth,
    createFrameElement: ProbeFrameElementFactory
) => ProbeTransformedNode;

const memoType = Symbol.for('react.memo');
const forwardRefType = Symbol.for('react.forward_ref');
const contextType = Symbol.for('react.context');

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Object.hasOwn(value, property);
}

function hasReactType(value: unknown, type: symbol): value is ProbeFrameType {
    return isRecord(value) && value.$$typeof === type;
}

function isMemoType(value: unknown): value is ProbeMemoType {
    return hasReactType(value, memoType) && hasProperty(value, 'type');
}

function isForwardRefType(value: unknown): value is ProbeForwardRefType {
    return isRecord(value) &&
        value.$$typeof === forwardRefType &&
        hasProperty(value, 'render') &&
        typeof value.render === 'function';
}

function isContextType(value: unknown): value is React.Context<unknown> {
    return hasReactType(value, contextType);
}

function isFunctionComponent(value: unknown): value is ProbeFunctionComponent {
    return typeof value === 'function';
}

function isIterable(value: unknown): value is Iterable<unknown> {
    return isRecord(value) && typeof value[Symbol.iterator] === 'function';
}

function isProbeElement(element: React.ReactElement): element is ProbeElement {
    return isRecord(element.props);
}

function readElementProps(element: ProbeElement): Readonly<Record<PropertyKey, unknown>> {
    return element.props;
}

function readElementChildren(element: ProbeElement): unknown {
    return readElementProps(element).children;
}

function readElementRef(element: ProbeElement): unknown {
    return readElementProps(element).ref;
}

function isPublicPropKey(key: PropertyKey): boolean {
    return key !== 'children' &&
        key !== 'key' &&
        key !== 'ref' &&
        key !== probeElementKeyMetadata;
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

function nextDepth(depth: ProbeFrameDepth): ProbeFrameDepth {
    return depth === 'full' ? depth : Math.max(0, depth - 1);
}

function canExecute(depth: ProbeFrameDepth): boolean {
    return depth === 'full' || depth > 0;
}

function createComponentMetadata(
    element: ProbeElement,
    renderedReason: ProbeNotRenderedReason | undefined
): ProbeComponentMetadata {
    const props = readElementProps(element);

    return Object.freeze({
        givenChildren: props.children,
        key: element.key,
        props: publicProps(props),
        renderedReason,
        type: element.type
    });
}

function createComponentHost(
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

function createEmptyHost(value: unknown): React.ReactElement {
    return React.createElement(probeEmptyHostType, {
        [probeValueMetadata]: value
    });
}

function createOpaqueHost(value: unknown): React.ReactElement {
    return React.createElement(probeOpaqueHostType, {
        [probeValueMetadata]: value
    });
}

function createProbeElement(element: React.ReactElement): ProbeElement {
    if (!isProbeElement(element)) {
        throw new TypeError('Probe expected React element props to be an object.');
    }

    return element;
}

function executeWrappedElement(
    type: unknown,
    props: Readonly<Record<PropertyKey, unknown>>,
    ref: unknown
): React.ReactNode {
    if (isMemoType(type) && isFunctionComponent(type.type)) {
        return type.type(props);
    }

    if (isMemoType(type) && isForwardRefType(type.type)) {
        return type.type.render(props, ref);
    }

    return isForwardRefType(type) ? type.render(props, ref) : createOpaqueHost(type);
}

function executeElement(element: ProbeElement): React.ReactNode {
    const { type } = element;
    const props = readElementProps(element);

    if (isFunctionComponent(type)) {
        return type(props);
    }

    return executeWrappedElement(type, props, readElementRef(element));
}

function isEmptyRenderable(node: unknown): boolean {
    return node === null || node === undefined || typeof node === 'boolean';
}

function cloneElementWithChildren(
    element: ProbeElement,
    children: ProbeTransformedNode
): React.ReactElement {
    if (element.type === React.Fragment) {
        return React.createElement(React.Fragment, null, children);
    }

    return React.cloneElement(element, {
        [probeElementKeyMetadata]: element.key
    }, children);
}

function transformCollection(
    nodes: readonly unknown[],
    depth: ProbeFrameDepth,
    transformChildNode: ProbeTransformNode,
    frameFactory: ProbeFrameElementFactory
): readonly ProbeTransformedNode[] {
    return nodes.map(function transformChild(node, index) {
        const transformedNode = transformChildNode(node, depth, frameFactory);

        return React.isValidElement(transformedNode)
            ? React.cloneElement(transformedNode, { key: transformedNode.key ?? `probe-${index}` })
            : transformedNode;
    });
}

function transformComponentElement(
    element: ProbeElement,
    depth: ProbeFrameDepth,
    frameFactory: ProbeFrameElementFactory
): React.ReactElement {
    const { type } = element;

    if (canExecute(depth) && (isFunctionComponent(type) || isMemoType(type) || isForwardRefType(type))) {
        return frameFactory(element, depth);
    }

    return createComponentHost(createComponentMetadata(element, 'depth'), createEmptyHost(undefined));
}

function transformPrimitiveNode(node: unknown): ProbeTransformedNode | undefined {
    if (isEmptyRenderable(node)) {
        return createEmptyHost(node);
    }

    if (typeof node === 'bigint') {
        return String(node);
    }

    return typeof node === 'string' || typeof node === 'number' ? node : undefined;
}

function transformRenderableElement(
    element: ProbeElement,
    depth: ProbeFrameDepth,
    transformChildNode: ProbeTransformNode,
    frameFactory: ProbeFrameElementFactory
): React.ReactElement {
    return cloneElementWithChildren(
        element,
        transformChildNode(readElementChildren(element), depth, frameFactory)
    );
}

function transformElement(
    element: ProbeElement,
    depth: ProbeFrameDepth,
    transformChildNode: ProbeTransformNode,
    frameFactory: ProbeFrameElementFactory
): React.ReactElement {
    const { type } = element;

    if (typeof type === 'string' || type === React.Fragment || isContextType(type)) {
        return transformRenderableElement(element, depth, transformChildNode, frameFactory);
    }

    return transformComponentElement(element, depth, frameFactory);
}

function transformNode(
    node: unknown,
    depth: ProbeFrameDepth,
    frameFactory: ProbeFrameElementFactory
): ProbeTransformedNode {
    const primitiveNode = transformPrimitiveNode(node);

    if (primitiveNode !== undefined) {
        return primitiveNode;
    }

    if (React.isValidElement(node)) {
        return transformElement(createProbeElement(node), depth, transformNode, frameFactory);
    }

    if (Array.isArray(node)) {
        return transformCollection(node, depth, transformNode, frameFactory);
    }

    return isIterable(node)
        ? transformCollection(Array.from(node), depth, transformNode, frameFactory)
        : createOpaqueHost(node);
}

function ProbeFrame(props: ProbeFrameProps): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(props.element, undefined),
        transformNode(executeElement(props.element), nextDepth(props.depth), props.createFrameElement)
    );
}

function createFrameElement(element: ProbeElement, depth: ProbeFrameDepth): React.ReactElement {
    return React.createElement(ProbeFrame, {
        createFrameElement,
        depth,
        element
    });
}

export function createProbeRenderElement(
    element: React.ReactElement,
    depth: ProbeFrameDepth
): React.ReactElement {
    return transformElement(createProbeElement(element), depth, transformNode, createFrameElement);
}
