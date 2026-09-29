import React from 'react';
import { classifyElementType, type ReactElementKindByName } from '../../values/introspect-react-element-kind.ts';
import { isEmptyReactNode, isIterable, isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';
import {
    createActivityComponentHost,
    createEmptyHost,
    createExecutedComponentHost,
    createOpaqueHost,
    createUnexecutedComponentHost,
    elementKeyProps
} from '../protocol/introspect-host-protocol.ts';
import { assertNotPortal } from '../../values/introspect-unsupported-react.ts';
import { createIntrospectionUsageError } from '../../values/introspect-usage-error.ts';
import { readClassFrameType } from './introspect-class-frame.ts';
import { readConsumerFrame } from './introspect-consumer-frame.ts';
import {
    type IntrospectionElement,
    type IntrospectionTransformedNode,
    readElementRef
} from './introspect-frame-contract.ts';
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

type IntrospectionFrameComponent = React.FunctionComponent<IntrospectionFrameProps>;

function isIntrospectionElement(element: React.ReactElement): element is IntrospectionElement {
    return isObjectOrFunction(element.props);
}

function readActivityMode(element: IntrospectionElement): 'hidden' | 'visible' {
    return element.props.mode === 'hidden' ? 'hidden' : 'visible';
}

function createIntrospectionElement(element: React.ReactElement): IntrospectionElement {
    if (!isIntrospectionElement(element)) {
        throw createIntrospectionUsageError('Introspection expected React element props to be an object.');
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
    return unwrapThenableNode(executeType(type, element.props, readElementRef(element)));
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

function cloneWithTransformedChildren(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    return React.cloneElement(element, {}, transformNode(element.props.children, depth));
}

function createClassFrameElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    type: ReactElementKindByName['class']['component']
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
    const executableType = unwrapExecutableType(props.element.type);
    const executableKind = classifyElementType(executableType);

    if (executableKind.kind === 'class') {
        return createClassFrameElement(props.element, props.depth, executableKind.component);
    }

    return createExecutedComponentHost(
        props.element,
        transformNode(
            executeIntrospectionFrameElement(executableType, props.element),
            nextDepth(props.depth, props.element.type)
        )
    );
}

function haveEqualFrameDepth(previous: IntrospectionFrameDepth, next: IntrospectionFrameDepth): boolean {
    return previous.budget === next.budget && previous.counting === next.counting && previous.policy === next.policy;
}

function readMemoKindThroughLazy(type: unknown): ReactElementKindByName['memo'] | undefined {
    const elementKind = classifyElementType(type);

    if (elementKind.kind === 'lazy') {
        return readMemoKindThroughLazy(elementKind.resolved);
    }

    return elementKind.kind === 'memo' ? elementKind : undefined;
}

function haveEqualMemoProps(previous: IntrospectionElement, next: IntrospectionElement): boolean {
    const memoKind = readMemoKindThroughLazy(next.type);

    return memoKind?.compare(previous.props, next.props) === true;
}

function areMemoFramePropsEqual(previous: IntrospectionFrameProps, next: IntrospectionFrameProps): boolean {
    return readElementRef(previous.element) === readElementRef(next.element) &&
        haveEqualFrameDepth(previous.depth, next.depth) &&
        haveEqualMemoProps(previous.element, next.element);
}

function createIntrospectionFrame(): IntrospectionFrameComponent {
    return IntrospectionFrame.bind(undefined);
}

function createMemoIntrospectionFrame(): IntrospectionFrameComponent {
    return React.memo(createIntrospectionFrame(), areMemoFramePropsEqual);
}

const framesByComponentType = new WeakMap<WeakKey, IntrospectionFrameComponent>();

function transformUnsupportedElement(element: IntrospectionElement): React.ReactElement {
    return createUnexecutedComponentHost(element, 'unsupported');
}

function transformComponentElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    createFrameElement: (componentDepth: IntrospectionFrameDepth) => React.ReactElement
): React.ReactElement {
    const componentDepth = enterComponentDepth(depth, element.type);

    return canExecuteComponent(componentDepth, element.type)
        ? createFrameElement(componentDepth)
        : createUnexecutedComponentHost(element, 'depth');
}

function transformFunctionFrameElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth,
    frame: IntrospectionFrameComponent
): React.ReactElement {
    return transformComponentElement(element, depth, function createFunctionFrameElement(componentDepth) {
        return React.createElement(frame, { depth: componentDepth, element, key: element.key ?? undefined });
    });
}

function transformActivityElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    return createActivityComponentHost(
        element,
        readActivityMode(element),
        cloneWithTransformedChildren(element, depth)
    );
}

function transformNamedWrapperElement(
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    return createExecutedComponentHost(element, cloneWithTransformedChildren(element, depth));
}

type ElementTransforms = {
    readonly [Name in keyof ReactElementKindByName]: (
        element: IntrospectionElement,
        depth: IntrospectionFrameDepth,
        elementKind: ReactElementKindByName[Name]
    ) => React.ReactElement;
};

const elementTransforms: ElementTransforms = {
    activity: transformActivityElement,
    class(element, depth, elementKind) {
        return transformComponentElement(element, depth, function createClassFrame(componentDepth) {
            return createClassFrameElement(element, componentDepth, elementKind.component);
        });
    },
    consumer(element, depth, elementKind) {
        return React.createElement(readConsumerFrame(elementKind.context), {
            depth,
            element,
            key: element.key ?? undefined,
            renderChildren: transformNode
        });
    },
    context: transformRenderableElement,
    forwardRef(element, depth, elementKind) {
        return transformFunctionFrameElement(
            element,
            depth,
            framesByComponentType.getOrInsertComputed(elementKind.type, createIntrospectionFrame)
        );
    },
    fragment: transformFragmentElement,
    function(element, depth, elementKind) {
        return transformFunctionFrameElement(
            element,
            depth,
            framesByComponentType.getOrInsertComputed(elementKind.component, createIntrospectionFrame)
        );
    },
    host: transformRenderableElement,
    lazy(element, depth, elementKind) {
        return transformFunctionFrameElement(
            element,
            depth,
            framesByComponentType.getOrInsertComputed(elementKind.type, createMemoIntrospectionFrame)
        );
    },
    memo(element, depth, elementKind) {
        return transformFunctionFrameElement(
            element,
            depth,
            framesByComponentType.getOrInsertComputed(elementKind.type, createMemoIntrospectionFrame)
        );
    },
    other: transformUnsupportedElement,
    profiler: transformNamedWrapperElement,
    strictMode: transformNamedWrapperElement,
    suspense: transformSuspenseElement,
    viewTransition: transformNamedWrapperElement
};

function transformElementOfKind<Name extends keyof ReactElementKindByName>(
    name: Name,
    elementKind: ReactElementKindByName[Name],
    element: IntrospectionElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    return elementTransforms[name](element, depth, elementKind);
}

function transformElement(element: IntrospectionElement, depth: IntrospectionFrameDepth): React.ReactElement {
    const elementKind = classifyElementType(element.type);

    return transformElementOfKind(elementKind.kind, elementKind, element, depth);
}

export function createIntrospectionRenderElement(
    element: React.ReactElement,
    depth: IntrospectionFrameDepth
): React.ReactElement {
    assertNotPortal(element);

    return transformElement(createIntrospectionElement(element), depth);
}
