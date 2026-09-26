import type React from 'react';
import { expect } from 'tstyche';
import type {
    IntrospectionList,
    IntrospectionNode,
    IntrospectionOptions,
    IntrospectionSelector,
    IntrospectionView
} from './introspect-public-types.ts';

type HostSchema = {
    readonly button: {
        readonly disabled: boolean;
        readonly title: string;
    };
};

declare const Page: React.FC<{ readonly title: string; }>;
declare const MemoPage: React.MemoExoticComponent<typeof Page>;
declare const view: IntrospectionView<HostSchema>;
declare const buttonNode: IntrospectionNode<HostSchema['button'], 'button', HostSchema>;
declare const selector: IntrospectionSelector<HostSchema, HostSchema['button'], 'button'>;

expect(view.find('button')).type.toBe<IntrospectionNode<HostSchema['button'], 'button', HostSchema> | undefined>();
expect(view.findAll('button')).type.toBeAssignableTo<IntrospectionList<HostSchema['button'], 'button', HostSchema>>();
expect(buttonNode.props.disabled).type.toBe<boolean>();
expect(buttonNode.pickProps([ 'title' ])).type.toBe<Pick<HostSchema['button'], 'title'>>();
expect(selector).type.toBeAssignableTo<IntrospectionSelector<HostSchema, HostSchema['button'], 'button'>>();
expect({ depth: 'full', strictMode: false } as const).type.toBeAssignableTo<IntrospectionOptions<HostSchema>>();
expect(view.locate('button').pickProps([ 'title' ])).type.toBe<Pick<HostSchema['button'], 'title'> | undefined>();
expect(view.locate('button').props).type.toBe<HostSchema['button'] | undefined>();
expect(view.locate('button').type).type.toBe<'button' | undefined>();
expect(view.locate('button').pickProps).type.not.toBeCallableWith([ 'missing' ]);
expect({ depthFrom: Page, transparent: [ MemoPage ] }).type.toBeAssignableTo<IntrospectionOptions>();
expect({ depthFrom: 'main' }).type.not.toBeAssignableTo<IntrospectionOptions>();
expect({ transparent: [ 'section' ] }).type.not.toBeAssignableTo<IntrospectionOptions>();

type IconProps = { readonly name: string; };
type TabProps = {
    readonly actions: readonly React.ReactNode[];
    readonly badge: React.ReactNode;
    readonly config: { readonly icon: React.ReactElement<IconProps>; };
    readonly icon: React.ReactElement<IconProps>;
    readonly label: string;
    readonly onSelect: (id: string) => void;
};

declare const Tab: React.FC<TabProps>;
declare function isIntrospectionNode(value: unknown): value is IntrospectionNode;
declare const tabView: IntrospectionView;

const tab = tabView.find(Tab);

if (tab !== undefined) {
    expect(tab.props.icon.props.name).type.toBe<string>();
    expect(tab.props.config.icon.textContent).type.toBe<string>();
    expect(tab.props.label).type.toBe<string>();
    expect(tab.props.onSelect).type.toBe<(id: string) => void>();
    expect<'Inbox'>().type.toBeAssignableTo<typeof tab.props.badge>();
    expect<null>().type.toBeAssignableTo<typeof tab.props.badge>();

    const { badge } = tab.props;

    if (isIntrospectionNode(badge)) {
        expect(badge).type.toBeAssignableTo<typeof tab.props.badge>();
        expect(badge.textContent).type.toBe<string>();
    }

    expect(tab.props.actions).type.toBeAssignableTo<readonly (typeof tab.props.badge)[]>();
}
