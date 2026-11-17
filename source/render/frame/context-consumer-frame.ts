import React from 'react';
import { createExecutedComponentHost, createUnexecutedComponentHost } from '../protocol/host-protocol.ts';
import type { IntrospectionElement, IntrospectionRenderChildren } from './frame-contract.ts';
import type { IntrospectionFrameDepth } from './frame-depth.ts';

export type IntrospectionConsumerFrameProps = {
    readonly depth: IntrospectionFrameDepth;
    readonly element: IntrospectionElement;
    readonly renderChildren: IntrospectionRenderChildren;
};

type ConsumerRenderProp = (value: unknown) => React.ReactNode;

function isConsumerRenderProp(value: unknown): value is ConsumerRenderProp {
    return typeof value === 'function';
}

function renderConsumer(props: IntrospectionConsumerFrameProps, value: unknown): React.ReactElement {
    const renderProp = props.element.props.children;

    if (!isConsumerRenderProp(renderProp)) {
        return createUnexecutedComponentHost(props.element, 'unsupported');
    }

    return createExecutedComponentHost(props.element, props.renderChildren(renderProp(value), props.depth));
}

function createConsumerFrame(
    context: React.Context<unknown>
): React.ComponentClass<IntrospectionConsumerFrameProps> {
    const frame = class IntrospectionConsumerFrame extends React.Component<IntrospectionConsumerFrameProps> {
        public override render(): React.ReactElement {
            return renderConsumer(this.props, this.context);
        }
    };

    return Object.assign(frame, { contextType: context });
}

const consumerFramesByContext = new WeakMap<
    React.Context<unknown>,
    React.ComponentClass<IntrospectionConsumerFrameProps>
>();

export function readConsumerFrame(
    context: React.Context<unknown>
): React.ComponentClass<IntrospectionConsumerFrameProps> {
    return consumerFramesByContext.getOrInsertComputed(context, createConsumerFrame);
}
