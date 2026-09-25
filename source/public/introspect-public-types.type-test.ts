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
