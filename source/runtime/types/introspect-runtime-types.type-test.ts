import { expect } from 'tstyche';
import type {
    IntrospectionList,
    IntrospectionListLocator,
    IntrospectionLocator,
    IntrospectionNode,
    IntrospectionView
} from '../../public/introspect-public-types.ts';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionLocator,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionView,
    RuntimeNodeSequence
} from './introspect-runtime-types.ts';

declare const node: RuntimeIntrospectionNode;
declare const list: RuntimeIntrospectionList;
declare const view: RuntimeIntrospectionView;

expect(node.callProp('onClick', 'value')).type.toBe<unknown>();
expect(node.find('button')).type.toBe<RuntimeIntrospectionNode | undefined>();
expect(list.filterBy('button')).type.toBe<RuntimeIntrospectionList>();
expect(view.locate('button').node).type.toBe<RuntimeIntrospectionNode | undefined>();

expect<RuntimeIntrospectionView>().type.toBeAssignableTo<IntrospectionView>();
expect<RuntimeIntrospectionNode>().type.toBeAssignableTo<IntrospectionNode>();
expect<RuntimeIntrospectionNode>().type.toBeAssignableTo<
    Pick<IntrospectionNode<Readonly<Record<PropertyKey, unknown>>>, 'props'>
>();
expect<RuntimeIntrospectionList>().type.toBeAssignableTo<IntrospectionList>();
expect<RuntimeIntrospectionLocator>().type.toBeAssignableTo<IntrospectionLocator>();
expect<RuntimeNodeSequence>().type.toBeAssignableTo<IntrospectionListLocator>();

expect<keyof RuntimeIntrospectionView>().type.toBe<keyof IntrospectionView>();
expect<keyof RuntimeIntrospectionNode>().type.toBe<keyof IntrospectionNode>();
expect<keyof RuntimeIntrospectionList>().type.toBe<keyof IntrospectionList>();
expect<keyof RuntimeIntrospectionLocator>().type.toBe<keyof IntrospectionLocator>();
expect<keyof RuntimeNodeSequence>().type.toBe<keyof IntrospectionListLocator>();
