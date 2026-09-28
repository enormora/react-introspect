import React from 'react';
import { classifyElementType, type ReactElementKind } from '../../values/introspect-react-element-kind.ts';
import { isEmptyReactNode, isIterable, isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    createOpaqueHost,
    elementKeyProps
} from '../protocol/introspect-host-protocol.ts';
import { isClassComponent, readClassFrameType } from './introspect-class-frame.ts';
import {
    type IntrospectionElement,
    type IntrospectionTransformedNode,
    readElementRef
} from './introspect-frame-contract.ts';
import { throwIntrospectionRenderError } from './introspect-render-error.ts';
import {
    canExecuteComponent,
    enterComponentDepth,
    type IntrospectionFrameDepth,
    nextDepth
} from './introspect-frame-depth.ts';
import { assertNotPortal } from './introspect-unsupported-react.ts';

type IntrospectionFrameProps = {
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
};

const executableElementKinds = new Set<ReactElementKind['kind']>([ 'forwardRef', 'function', 'lazy', 'memo' ]);

function isIntrospectionElement(element: React.ReactElement): element is IntrospectionElement {
    return isObjectOrFunction(element.props);
}

function readActivityMode(element: IntrospectionElement): 'hidden' | 'visible' {
    return element.props.mode === 'hidden' ? 'hidden' : 'visible';
}

function createIntrospectionElement(element: React.ReactElement): IntrospectionElement {
    if (!isIntrospectionElement(element)) {
        throw new TypeError('Introspection expected React element props to be an object.');
    }

    return element;
}

function unwrapThenableNode(node: React.ReactNode): React.ReactNode {
    return isThenable(node) ? React.use(node) as React.ReactNode : node;
}

function executeWrappedElement(
    type: unknown,
    props: Readonly<Record<PropertyKey, unknown>>,
    ref: unknown
): React.ReactNode {
    const elementKind = classifyElementType(type);

    if (elementKind.kind === 'lazy') {
        return executeWrappedElement(elementKind.initialize(), props, ref);
    }

    if (elementKind.kind === 'memo') {
        return executeWrappedElement(elementKind.inner, props, ref);
    }

    if (elementKind.kind === 'function' && !isClassComponent(elementKind.component)) {
        return elementKind.component(props);
    }

    return elementKind.kind === 'forwardRef' ? elementKind.render(props, ref) : createOpaqueHost(type);
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

function isExecutableComponentType(type: unknown): boolean {
    return executableElementKinds.has(classifyElementType(type).kind);
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
    const children = transformNode(element.props.children, depth);

    if (element.type === React.Fragment) {
        return React.createElement(React.Fragment, null, children);
    }

    return React.cloneElement(element, elementKeyProps(element), children);
}

function transformSuspenseElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const children = transformNode(element.props.children, depth);

    return React.cloneElement(element, {
        ...elementKeyProps(element),
        fallback: transformNode(element.props.fallback, depth)
    }, children);
}

function transformWrapperElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    activityMode: 'hidden' | 'visible' | undefined
): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({ activityMode, caughtError: undefined, element, renderedReason: undefined }),
        React.cloneElement(element, {}, transformNode(element.props.children, depth))
    );
}

function IntrospectionFrame(props: IntrospectionFrameProps): React.ReactElement {
    return createComponentHost(
        createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element: props.element,
            renderedReason: undefined
        }),
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

    return createComponentHost(
        createComponentMetadata({ activityMode: undefined, caughtError: undefined, element, renderedReason: 'depth' }),
        createEmptyHost(undefined)
    );
}

function transformActivityElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return transformWrapperElement(element, depth, readActivityMode(element));
}

function transformViewTransitionElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    return transformWrapperElement(element, depth, undefined);
}

const elementTransforms: Readonly<
    Record<
        ReactElementKind['kind'],
        (element: IntrospectionElement, depth: IntrospectionFrameDepth) => React.ReactElement
    >
> = {
    activity: transformActivityElement,
    context: transformRenderableElement,
    forwardRef: transformComponentElement,
    fragment: transformRenderableElement,
    function: transformComponentElement,
    host: transformRenderableElement,
    lazy: transformComponentElement,
    memo: transformComponentElement,
    other: transformComponentElement,
    suspense: transformSuspenseElement,
    viewTransition: transformViewTransitionElement
};

function transformElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return elementTransforms[classifyElementType(element.type).kind](element, depth);
}

export function createIntrospectionRenderElement(
    element: React.ReactElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    assertNotPortal(element);

    return transformElement(createIntrospectionElement(element), depth);
}
