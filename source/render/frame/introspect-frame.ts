import React from 'react';
import { classifyElementType, type ReactElementKind } from '../../values/introspect-react-element-kind.ts';
import { isEmptyReactNode, isIterable, isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import {
    createComponentHost,
    createComponentMetadata,
    createEmptyHost,
    createOpaqueHost,
    createUnexecutedComponentHost,
    elementKeyProps
} from '../protocol/introspect-host-protocol.ts';
import { assertNotPortal } from '../../values/introspect-unsupported-react.ts';
import type { IntrospectionClassComponent } from '../../values/introspect-class-component.ts';
import { readClassFrameType } from './introspect-class-frame.ts';
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

type IntrospectionFrameProps = {
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
};

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

function unwrapExecutableType(type: unknown): unknown {
    const elementKind = classifyElementType(type);

    if (elementKind.kind === 'lazy') {
        return unwrapExecutableType(elementKind.initialize());
    }

    return elementKind.kind === 'memo' ? unwrapExecutableType(elementKind.inner) : type;
}

function resolveExecutableType(element: IntrospectionElement): unknown {
    try {
        return unwrapExecutableType(element.type);
    } catch (error) {
        return throwIntrospectionRenderError(error);
    }
}

function executeType(
    type: unknown,
    props: Readonly<Record<PropertyKey, unknown>>,
    ref: unknown
): React.ReactNode {
    const elementKind = classifyElementType(type);

    if (elementKind.kind === 'function') {
        return elementKind.component(props);
    }

    return elementKind.kind === 'forwardRef' ? elementKind.render(props, ref) : createOpaqueHost(type);
}

function executeIntrospectionFrameElement(type: unknown, element: IntrospectionElement): React.ReactNode {
    try {
        return unwrapThenableNode(executeType(type, element.props, readElementRef(element)));
    } catch (error) {
        return throwIntrospectionRenderError(error);
    }
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

function transformFragmentElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return React.createElement(React.Fragment, null, transformNode(element.props.children, depth));
}

function transformRenderableElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return React.cloneElement(element, elementKeyProps(element), transformNode(element.props.children, depth));
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

function createClassFrameElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    type: IntrospectionClassComponent
): React.ReactElement {
    return React.createElement(readClassFrameType(type), {
        depth,
        element,
        key: element.key ?? undefined,
        renderChildren: transformNode,
        type
    });
}

function IntrospectionFrame(props: IntrospectionFrameProps): React.ReactElement {
    const executableType = resolveExecutableType(props.element);
    const executableKind = classifyElementType(executableType);

    if (executableKind.kind === 'class') {
        return createClassFrameElement(props.element, props.depth, executableKind.component);
    }

    return createComponentHost(
        createComponentMetadata({
            activityMode: undefined,
            caughtError: undefined,
            element: props.element,
            renderedReason: undefined
        }),
        transformNode(
            executeIntrospectionFrameElement(executableType, props.element),
            nextDepth(props.depth, props.element.type)
        )
    );
}

function createFrameElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const elementKind = classifyElementType(element.type);

    if (elementKind.kind === 'class') {
        return createClassFrameElement(element, depth, elementKind.component);
    }

    return React.createElement(IntrospectionFrame, {
        depth,
        element,
        key: element.key ?? undefined
    });
}

function transformUnsupportedElement(element: IntrospectionElement): React.ReactElement {
    return createUnexecutedComponentHost(element, 'unsupported');
}

function transformComponentElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const componentDepth = enterComponentDepth(depth, element.type);

    return canExecuteComponent(componentDepth, element.type)
        ? createFrameElement(element, componentDepth)
        : createUnexecutedComponentHost(element, 'depth');
}

function transformActivityElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return transformWrapperElement(element, depth, readActivityMode(element));
}

function transformNamedWrapperElement(
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
    class: transformComponentElement,
    context: transformRenderableElement,
    forwardRef: transformComponentElement,
    fragment: transformFragmentElement,
    function: transformComponentElement,
    host: transformRenderableElement,
    lazy: transformComponentElement,
    memo: transformComponentElement,
    other: transformUnsupportedElement,
    profiler: transformNamedWrapperElement,
    strictMode: transformNamedWrapperElement,
    suspense: transformSuspenseElement,
    viewTransition: transformNamedWrapperElement
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
