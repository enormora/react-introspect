import React from 'react';
import { isClassComponent, readClassFrameType } from './introspect-class-frame.ts';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    nextDepth,
    type IntrospectionElement,
    introspectionElementKeyMetadata,
    type IntrospectionFrameDepth,
    introspectionOpaqueHostType,
    type IntrospectionTransformedNode,
    introspectionValueMetadata,
    readElementProps,
    readElementRef,
    throwIntrospectionRenderError
} from './introspect-frame-contract.ts';
import { createUnsupportedReactValueError, isReactPortalValue } from './introspect-unsupported-react.ts';

type IntrospectionFrameProps = {
    readonly createFrameElement: IntrospectionFrameElementFactory;
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
    readonly transformNode: IntrospectionTransformNode;
};

type IntrospectionFrameType = {
    readonly $$typeof: symbol;
};

type IntrospectionMemoType = IntrospectionFrameType & {
    readonly type: unknown;
};

type IntrospectionForwardRefType = IntrospectionFrameType & {
    readonly render: (props: Readonly<Record<PropertyKey, unknown>>, ref: unknown) => React.ReactNode;
};

type IntrospectionFunctionComponent = (props: Readonly<Record<PropertyKey, unknown>>) => React.ReactNode;

type IntrospectionFrameElementFactory = (
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth
) => React.ReactElement;

type IntrospectionTransformNode = (
    node: unknown,
    depth: IntrospectionFrameDepth,
    createFrameElement: IntrospectionFrameElementFactory
) => IntrospectionTransformedNode;

type IntrospectionSuspenseTransformRequest = {
    readonly createFrameElement: IntrospectionFrameElementFactory;
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
    readonly transformedChildren: IntrospectionTransformedNode;
    readonly transformNode: IntrospectionTransformNode;
};

type IntrospectionThenable = {
    readonly then: (
        resolve: (value: unknown) => void,
        reject: (reason: unknown) => void
    ) => unknown;
};

type IntrospectionLazyInitializer = (payload: unknown) => unknown;

const memoType = Symbol.for('react.memo');
const forwardRefType = Symbol.for('react.forward_ref');
const lazyType = Symbol.for('react.lazy');
const contextType = Symbol.for('react.context');
const activityType: unknown = Symbol.for('react.activity');
const viewTransitionType: unknown = Symbol.for('react.view_transition');
const lazyInitializerKey = '_init';
const lazyPayloadKey = '_payload';

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === 'object' && value !== null || typeof value === 'function';
}

function hasProperty(value: Readonly<Record<PropertyKey, unknown>>, property: PropertyKey): boolean {
    return Object.hasOwn(value, property);
}

function hasReactType(value: unknown, type: symbol): value is IntrospectionFrameType {
    return isRecord(value) && value.$$typeof === type;
}

function isMemoType(value: unknown): value is IntrospectionMemoType {
    return hasReactType(value, memoType) && hasProperty(value, 'type');
}

function isForwardRefType(value: unknown): value is IntrospectionForwardRefType {
    return isRecord(value) &&
        value.$$typeof === forwardRefType &&
        hasProperty(value, 'render') &&
        typeof value.render === 'function';
}

function isLazyInitializer(value: unknown): value is IntrospectionLazyInitializer {
    return typeof value === 'function';
}

function readLazyInitializer(value: Readonly<Record<PropertyKey, unknown>>): IntrospectionLazyInitializer | undefined {
    const initializer: unknown = Reflect.get(value, lazyInitializerKey);

    return isLazyInitializer(initializer) ? initializer : undefined;
}

function isLazyType(value: unknown): value is IntrospectionFrameType {
    return isRecord(value) &&
        value.$$typeof === lazyType &&
        hasProperty(value, lazyInitializerKey) &&
        hasProperty(value, lazyPayloadKey) &&
        readLazyInitializer(value) !== undefined;
}

function isContextType(value: unknown): value is React.Context<unknown> {
    return hasReactType(value, contextType);
}

function isFunctionComponent(value: unknown): value is IntrospectionFunctionComponent {
    return typeof value === 'function';
}

function isIterable(value: unknown): value is Iterable<unknown> {
    return isRecord(value) && typeof value[Symbol.iterator] === 'function';
}

function isThenable(value: unknown): value is IntrospectionThenable {
    return isRecord(value) && typeof Reflect.get(value, 'then') === 'function';
}

function isIntrospectionElement(element: React.ReactElement): element is IntrospectionElement {
    return isRecord(element.props);
}

function readElementChildren(element: IntrospectionElement): unknown {
    return readElementProps(element).children;
}

function readActivityMode(element: IntrospectionElement): 'hidden' | 'visible' {
    return readElementProps(element).mode === 'hidden' ? 'hidden' : 'visible';
}

function canExecute(depth: IntrospectionFrameDepth): boolean {
    return depth === 'full' || depth > 0;
}

function createOpaqueHost(value: unknown): React.ReactElement {
    return React.createElement(introspectionOpaqueHostType, {
        [introspectionValueMetadata]: value
    });
}

function createIntrospectionElement(element: React.ReactElement): IntrospectionElement {
    if (!isIntrospectionElement(element)) {
        throw new TypeError('Introspection expected React element props to be an object.');
    }

    return element;
}

function readLazyType(type: IntrospectionFrameType): unknown {
    return readLazyInitializer(type)?.(Reflect.get(type, lazyPayloadKey));
}

function unwrapThenableNode(node: React.ReactNode): React.ReactNode {
    return isThenable(node) ? React.use(node) as React.ReactNode : node;
}

function executeWrappedElement(
    type: unknown,
    props: Readonly<Record<PropertyKey, unknown>>,
    ref: unknown
): React.ReactNode {
    if (isLazyType(type)) {
        return executeWrappedElement(readLazyType(type), props, ref);
    }

    if (isMemoType(type)) {
        return executeWrappedElement(type.type, props, ref);
    }

    if (isFunctionComponent(type) && !isClassComponent(type)) {
        return type(props);
    }

    return isForwardRefType(type) ? type.render(props, ref) : createOpaqueHost(type);
}

function executeElement(element: IntrospectionElement): React.ReactNode {
    const { type } = element;
    const props = readElementProps(element);

    if (isFunctionComponent(type) && !isClassComponent(type)) {
        return type(props);
    }

    return executeWrappedElement(type, props, readElementRef(element));
}

function executeIntrospectionFrameElement(element: IntrospectionElement): React.ReactNode {
    try {
        return unwrapThenableNode(executeElement(element));
    } catch (error) {
        return throwIntrospectionRenderError(error);
    }
}

function isEmptyRenderable(node: unknown): boolean {
    return node === null || node === undefined || typeof node === 'boolean';
}

function cloneElementWithChildren(
    element: IntrospectionElement,
    children: IntrospectionTransformedNode
): React.ReactElement {
    if (element.type === React.Fragment) {
        return React.createElement(React.Fragment, null, children);
    }

    return React.cloneElement(element, {
        [introspectionElementKeyMetadata]: element.key
    }, children);
}

function cloneSuspenseElement(request: IntrospectionSuspenseTransformRequest): React.ReactElement {
    const props = readElementProps(request.element);

    return React.cloneElement(request.element, {
        [introspectionElementKeyMetadata]: request.element.key,
        fallback: request.transformNode(props.fallback, request.depth, request.createFrameElement)
    }, request.transformedChildren);
}

function cloneWrapperElement(
    element: IntrospectionElement,
    children: IntrospectionTransformedNode
): React.ReactElement {
    return React.cloneElement(element, {}, children);
}

function transformCollection(
    nodes: readonly unknown[],
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): readonly IntrospectionTransformedNode[] {
    return nodes.map(function transformChild(node, index) {
        const transformedNode = transformChildNode(node, depth, frameFactory);

        return React.isValidElement(transformedNode)
            ? React.cloneElement(transformedNode, { key: transformedNode.key ?? `introspect-${index}` })
            : transformedNode;
    });
}

function isExecutableComponentType(type: unknown): boolean {
    return isClassComponent(type) ||
        isFunctionComponent(type) ||
        isMemoType(type) ||
        isForwardRefType(type) ||
        isLazyType(type);
}

function isActivityType(type: unknown): boolean {
    return type === activityType;
}

function isViewTransitionType(type: unknown): boolean {
    return type === viewTransitionType;
}

function isRenderableElementType(type: unknown): boolean {
    return typeof type === 'string' || type === React.Fragment || isContextType(type);
}

function transformComponentElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    if (canExecute(depth) && isExecutableComponentType(element.type)) {
        return frameFactory(element, depth);
    }

    return createComponentHost(createComponentMetadata(element, 'depth'), createEmptyHost(undefined));
}

function transformPrimitiveNode(node: unknown): IntrospectionTransformedNode | undefined {
    if (isEmptyRenderable(node)) {
        return createEmptyHost(node);
    }

    if (typeof node === 'bigint') {
        return String(node);
    }

    return typeof node === 'string' || typeof node === 'number' ? node : undefined;
}

function transformRenderableElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    return cloneElementWithChildren(
        element,
        transformChildNode(readElementChildren(element), depth, frameFactory)
    );
}

function transformSuspenseElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    return cloneSuspenseElement({
        createFrameElement: frameFactory,
        depth,
        element,
        transformedChildren: transformChildNode(readElementChildren(element), depth, frameFactory),
        transformNode: transformChildNode
    });
}

function transformActivityElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(element, undefined, undefined, readActivityMode(element)),
        cloneWrapperElement(element, transformChildNode(readElementChildren(element), depth, frameFactory))
    );
}

function transformViewTransitionElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(element, undefined),
        cloneWrapperElement(element, transformChildNode(readElementChildren(element), depth, frameFactory))
    );
}

function transformElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    transformChildNode: IntrospectionTransformNode,
    frameFactory: IntrospectionFrameElementFactory
): React.ReactElement {
    const { type } = element;

    if (type === React.Suspense) {
        return transformSuspenseElement(element, depth, transformChildNode, frameFactory);
    }

    if (isActivityType(type)) {
        return transformActivityElement(element, depth, transformChildNode, frameFactory);
    }

    if (isViewTransitionType(type)) {
        return transformViewTransitionElement(element, depth, transformChildNode, frameFactory);
    }

    if (isRenderableElementType(type)) {
        return transformRenderableElement(element, depth, transformChildNode, frameFactory);
    }

    return transformComponentElement(element, depth, frameFactory);
}

function transformNode(
    node: unknown,
    depth: IntrospectionFrameDepth,
    frameFactory: IntrospectionFrameElementFactory
): IntrospectionTransformedNode {
    if (isReactPortalValue(node)) {
        throw createUnsupportedReactValueError();
    }

    const primitiveNode = transformPrimitiveNode(node);

    if (primitiveNode !== undefined) {
        return primitiveNode;
    }

    if (React.isValidElement(node)) {
        return transformElement(createIntrospectionElement(node), depth, transformNode, frameFactory);
    }

    if (Array.isArray(node)) {
        return transformCollection(node, depth, transformNode, frameFactory);
    }

    return isIterable(node)
        ? transformCollection(Array.from(node), depth, transformNode, frameFactory)
        : createOpaqueHost(node);
}

function IntrospectionFrame(props: IntrospectionFrameProps): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(props.element, undefined),
        props.transformNode(
            executeIntrospectionFrameElement(props.element),
            nextDepth(props.depth),
            props.createFrameElement
        )
    );
}

function createFrameElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    if (isClassComponent(element.type)) {
        return React.createElement(readClassFrameType(element.type), {
            createFrameElement,
            depth,
            element,
            transformNode,
            type: element.type
        });
    }

    return React.createElement(IntrospectionFrame, {
        createFrameElement,
        depth,
        element,
        transformNode
    });
}

export function createIntrospectionRenderElement(
    element: React.ReactElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    if (isReactPortalValue(element)) {
        throw createUnsupportedReactValueError();
    }

    return transformElement(createIntrospectionElement(element), depth, transformNode, createFrameElement);
}
