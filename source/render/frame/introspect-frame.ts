import React from 'react';
import { isEmptyReactNode, isIterable, isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import { isClassComponent, readClassFrameType } from './introspect-class-frame.ts';
import {
    createComponentHost,
    createComponentMetadata,
    canExecuteComponent,
    createEmptyHost,
    enterComponentDepth,
    nextDepth,
    type IntrospectionElement,
    introspectionElementKeyMetadata,
    type IntrospectionFrameDepth,
    introspectionOpaqueHostType,
    type IntrospectionTransformedNode,
    introspectionValueMetadata,
    readElementRef,
    throwIntrospectionRenderError
} from './introspect-frame-contract.ts';
import { assertNotPortal } from './introspect-unsupported-react.ts';

type IntrospectionFrameProps = {
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
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

type IntrospectionLazyInitializer = (payload: unknown) => unknown;

const memoType = Symbol.for('react.memo');
const forwardRefType = Symbol.for('react.forward_ref');
const lazyType = Symbol.for('react.lazy');
const contextType = Symbol.for('react.context');
const activityType: unknown = Symbol.for('react.activity');
const viewTransitionType: unknown = Symbol.for('react.view_transition');
const lazyInitializerKey = '_init';
const lazyPayloadKey = '_payload';

function hasReactType(value: unknown, type: symbol): value is IntrospectionFrameType {
    return isObjectOrFunction(value) && value.$$typeof === type;
}

function isMemoType(value: unknown): value is IntrospectionMemoType {
    return hasReactType(value, memoType) && Object.hasOwn(value, 'type');
}

function isForwardRefType(value: unknown): value is IntrospectionForwardRefType {
    return isObjectOrFunction(value) &&
        value.$$typeof === forwardRefType &&
        Object.hasOwn(value, 'render') &&
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
    return isObjectOrFunction(value) &&
        value.$$typeof === lazyType &&
        Object.hasOwn(value, lazyInitializerKey) &&
        Object.hasOwn(value, lazyPayloadKey) &&
        readLazyInitializer(value) !== undefined;
}

function isContextType(value: unknown): value is React.Context<unknown> {
    return hasReactType(value, contextType);
}

function isFunctionComponent(value: unknown): value is IntrospectionFunctionComponent {
    return typeof value === 'function';
}

function isIntrospectionElement(element: React.ReactElement): element is IntrospectionElement {
    return isObjectOrFunction(element.props);
}

function readActivityMode(element: IntrospectionElement): 'hidden' | 'visible' {
    return element.props.mode === 'hidden' ? 'hidden' : 'visible';
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

function executeIntrospectionFrameElement(element: IntrospectionElement): React.ReactNode {
    try {
        return unwrapThenableNode(
            executeWrappedElement(element.type, element.props, readElementRef(element))
        );
    } catch (error) {
        return throwIntrospectionRenderError(error);
    }
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

function cloneWrapperElement(
    element: IntrospectionElement,
    children: IntrospectionTransformedNode
): React.ReactElement {
    return React.cloneElement(element, {}, children);
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

function transformPrimitiveNode(node: unknown): IntrospectionTransformedNode | undefined {
    if (isEmptyReactNode(node)) {
        return createEmptyHost(node);
    }

    if (typeof node === 'bigint') {
        return String(node);
    }

    return typeof node === 'string' || typeof node === 'number' ? node : undefined;
}

function transformCollection(
    nodes: readonly unknown[],
    depth: IntrospectionFrameDepth
): readonly IntrospectionTransformedNode[] {
    return nodes.map(function transformChild(node, index) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- node and collection transforms recurse into each other
        const transformedNode = transformNode(node, depth);

        return React.isValidElement(transformedNode)
            ? React.cloneElement(transformedNode, { key: transformedNode.key ?? `introspect-${index}` })
            : transformedNode;
    });
}

function transformNode(node: unknown, depth: IntrospectionFrameDepth): IntrospectionTransformedNode {
    assertNotPortal(node);

    const primitiveNode = transformPrimitiveNode(node);

    if (primitiveNode !== undefined) {
        return primitiveNode;
    }

    if (React.isValidElement(node)) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- node and element transforms recurse into each other
        return transformElement(createIntrospectionElement(node), depth);
    }

    if (Array.isArray(node)) {
        return transformCollection(node, depth);
    }

    return isIterable(node) ? transformCollection(Array.from(node), depth) : createOpaqueHost(node);
}

function transformRenderableElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return cloneElementWithChildren(element, transformNode(element.props.children, depth));
}

function transformSuspenseElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const children = transformNode(element.props.children, depth);

    return React.cloneElement(element, {
        [introspectionElementKeyMetadata]: element.key,
        fallback: transformNode(element.props.fallback, depth)
    }, children);
}

function transformWrapperElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    activityMode: 'hidden' | 'visible' | undefined
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(element, undefined, undefined, activityMode),
        cloneWrapperElement(element, transformNode(element.props.children, depth))
    );
}

function IntrospectionFrame(props: IntrospectionFrameProps): React.ReactElement {
    return createComponentHost(
        createComponentMetadata(props.element, undefined),
        transformNode(executeIntrospectionFrameElement(props.element), nextDepth(props.depth, props.element.type))
    );
}

function createFrameElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    if (isClassComponent(element.type)) {
        return React.createElement(readClassFrameType(element.type), {
            depth,
            element,
            key: element.key ?? undefined,
            renderChildren: transformNode,
            type: element.type
        });
    }

    return React.createElement(IntrospectionFrame, {
        depth,
        element,
        key: element.key ?? undefined
    });
}

function transformComponentElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const componentDepth = enterComponentDepth(depth, element.type);

    if (canExecuteComponent(componentDepth, element.type) && isExecutableComponentType(element.type)) {
        return createFrameElement(element, componentDepth);
    }

    return createComponentHost(createComponentMetadata(element, 'depth'), createEmptyHost(undefined));
}

function transformElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const { type } = element;

    if (type === React.Suspense) {
        return transformSuspenseElement(element, depth);
    }

    if (isActivityType(type)) {
        return transformWrapperElement(element, depth, readActivityMode(element));
    }

    if (isViewTransitionType(type)) {
        return transformWrapperElement(element, depth, undefined);
    }

    if (isRenderableElementType(type)) {
        return transformRenderableElement(element, depth);
    }

    return transformComponentElement(element, depth);
}

export function createIntrospectionRenderElement(
    element: React.ReactElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    assertNotPortal(element);

    return transformElement(createIntrospectionElement(element), depth);
}
