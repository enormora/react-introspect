import { expect } from 'tstyche';
import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionOptions,
    RuntimeIntrospectionView
} from './introspect-runtime-types.ts';

declare const node: RuntimeIntrospectionNode;
declare const list: RuntimeIntrospectionList;
declare const view: RuntimeIntrospectionView;

expect(node.callProp('onClick', 'value')).type.toBe<unknown>();
expect(node.find('button')).type.toBe<RuntimeIntrospectionNode | undefined>();
expect(list.filterBy('button')).type.toBe<RuntimeIntrospectionList>();
expect(view.locate('button').node).type.toBe<RuntimeIntrospectionNode | undefined>();
expect({ depth: 1, warningMode: 'capture' } as const).type.toBeAssignableTo<RuntimeIntrospectionOptions>();
