import React from 'react';
import { expect } from 'tstyche';
import type {
    GivenChildren,
    ProbeError,
    ProbeList,
    ProbeListLocator,
    ProbeLocator,
    ProbeNode,
    ProbeNodeState,
    ProbeOptions,
    ProbeRefMatcher,
    ProbeRefRule,
    ProbeRefTarget,
    ProbeSelector,
    ProbeView,
    ProbeWarning,
    RenderedChildren
} from './probe-public-types.ts';
import {
    createFakeRefNode,
    matchRefs
} from './probe-ref.ts';
import {
    probe
} from './react-probe.entry-point.ts';

type ButtonProps = {
    readonly disabled: boolean;
    readonly label: string;
    readonly onSave: () => number;
};

type ButtonPublicProps = {
    readonly disabled: boolean;
    readonly label: string;
    readonly onSave: () => number;
};

type HostSchema = {
    readonly button: {
        readonly disabled: boolean;
        readonly type: 'button' | 'submit';
    };
};

function Button(props: React.PropsWithChildren<ButtonProps>): React.ReactNode {
    Reflect.ownKeys(props);

    return null;
}
const view = probe(React.createElement(Button, {
    disabled: true,
    label: 'Save',
    onSave() {
        return 1;
    }
}));
const button = view.find(Button);

expect(view).type.toBeAssignableTo<ProbeView>();
expect({ depth: 1, warningMode: 'throw' } as const).type.toBeAssignableTo<ProbeOptions>();
expect({
    refs: {
        input: createFakeRefNode({
            focus() {
                return undefined;
            }
        })
    }
})
    .type
    .toBeAssignableTo<ProbeOptions>();
expect({ message: 'warning', cause: undefined }).type.toBeAssignableTo<ProbeWarning>();
expect({ cause: undefined, handled: false, message: 'error' }).type.toBeAssignableTo<ProbeError>();
expect({ activityMode: undefined, reason: undefined, rendered: true, visible: true })
    .type
    .toBeAssignableTo<ProbeNodeState>();

if (button !== undefined) {
    expect(button).type.toBeAssignableTo<ProbeNode<ButtonPublicProps, typeof Button>>();
    expect(button.props.label).type.toBe<string>();
    expect(button.props.disabled).type.toBe<boolean>();
    expect(button.props.onSave()).type.toBe<number>();
    expect(button.givenChildren).type.toBeAssignableTo<GivenChildren>();
    expect(button.renderedChildren).type.toBeAssignableTo<RenderedChildren>();
    expect(button.pickProps([ 'label', 'disabled' ])).type.toBe<Pick<ButtonProps, 'disabled' | 'label'>>();
    expect(button.omitProps([ 'onSave' ])).type.toBe<{
        readonly disabled: boolean;
        readonly label: string;
    }>();
    expect(button.find(Button)).type.toBe<ProbeNode<ButtonPublicProps, typeof Button> | undefined>();
    expect(button.findAll(Button)).type.toBeAssignableTo<ProbeList<ButtonPublicProps, typeof Button>>();
    expect(button.findClosest(Button)).type.toBe<
        ProbeNode<ButtonPublicProps, typeof Button> | undefined
    >();

    button.pickProps([ 'label' ]);
    button.omitProps([ 'onSave' ]);

    // @ts-expect-error: Type '"missing"' is not assignable to type '"label" | "disabled" | "onSave"'.
    button.pickProps([ 'missing' ]);
    // @ts-expect-error: Property 'children' does not exist on type 'ProbeWithoutKeys<ButtonProps & { children?: ReactNode; }, "children">'.
    String(button.props.children);
}

expect(view.find({
    props: {
        label: 'Save'
    },
    type: Button
}))
    .type
    .toBe<ProbeNode<ButtonPublicProps, typeof Button> | undefined>();

const buttonLocator = view.locate(Button);
const buttonListLocator = view.locateAll(Button);

expect(buttonLocator).type.toBeAssignableTo<ProbeLocator<ButtonPublicProps, typeof Button>>();
expect(buttonLocator.callProp('onSave')).type.toBe<number>();
expect(buttonListLocator).type.toBeAssignableTo<
    ProbeListLocator<ButtonPublicProps, typeof Button>
>();

if (buttonLocator.node !== undefined) {
    expect(buttonLocator.node.props.label).type.toBe<string>();
}

if (buttonListLocator.first !== undefined) {
    expect(buttonListLocator.first.props.onSave()).type.toBe<number>();
}

const hostView = probe<HostSchema>(React.createElement('button'), {});
const hostButton = hostView.find('button');

if (hostButton !== undefined) {
    expect(hostButton.props.disabled).type.toBe<boolean>();
    expect(hostButton.props.type).type.toBe<'button' | 'submit'>();
    expect(hostButton.pickProps([ 'disabled' ])).type.toBe<Pick<HostSchema['button'], 'disabled'>>();
}

const hostLocator = hostView.locate('button');

if (hostLocator.node !== undefined) {
    expect(hostLocator.node.props.type).type.toBe<'button' | 'submit'>();
}

const unknownHost = view.find('button');

if (unknownHost !== undefined) {
    expect(unknownHost.props).type.toBe<unknown>();

    // @ts-expect-error: 'unknownHost.props' is of type 'unknown'.
    String(unknownHost.props.disabled);
}

expect({
    has: { type: 'strong' as const },
    props: { disabled: true },
    textContent: /save/i,
    type: 'button' as const,
    where(node: ProbeNode<HostSchema['button'], 'button', HostSchema>) {
        return node.name === 'button';
    }
})
    .type
    .toBeAssignableTo<ProbeSelector<HostSchema, HostSchema['button'], 'button'>>();

const fakeInput = createFakeRefNode({
    focus() {
        return 1;
    }
});
const buttonRefRule: ProbeRefRule<HostSchema, 'button'> = {
    node: fakeInput,
    props: { type: 'submit' },
    type: 'button',
    where(target) {
        expect(target).type.toBeAssignableTo<ProbeRefTarget<HostSchema['button'], 'button'>>();

        return target.props.disabled;
    }
};
const refMatcher = matchRefs<HostSchema>([
    {
        node: fakeInput,
        props: { type: 'submit' },
        type: 'button'
    }
]);

expect(fakeInput.focus()).type.toBe<1>();
expect(buttonRefRule).type.toBeAssignableTo<ProbeRefRule<HostSchema, 'button'>>();
expect(refMatcher).type.toBeAssignableTo<ProbeRefMatcher<HostSchema>>();
expect({ refs: refMatcher }).type.toBeAssignableTo<ProbeOptions<HostSchema>>();

if (refMatcher.rules[0] !== undefined) {
    expect(refMatcher.rules[0]).type.toBeAssignableTo<ProbeRefRule<HostSchema>>();
}
