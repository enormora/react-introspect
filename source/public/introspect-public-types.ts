import type React from 'react';

export type IntrospectionWarning = {
    readonly message: string;
    readonly cause: unknown;
};

export type IntrospectionError = {
    readonly message: string;
    readonly cause: unknown;
    readonly handled: boolean;
};

export type IntrospectionNodeState = {
    readonly rendered: boolean;
    readonly visible: boolean;
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly reason: IntrospectionNotRenderedReason | 'activity' | undefined;
};

export type IntrospectionOptions<HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema> = {
    readonly depth?: number | 'full';
    readonly errorMode?: 'capture' | 'throw';
    readonly hostSchema?: HostSchema;
    readonly idGenerator?: ((generatedId: string) => string) | undefined;
    readonly idPrefix?: string | undefined;
    readonly refs?: IntrospectionRefs<HostSchema> | undefined;
    readonly strictMode?: boolean;
    readonly waitTimeout?: number;
    readonly warningMode?: 'capture' | 'ignore' | 'throw';
};

export type IntrospectionHostSchema = Readonly<Record<string, unknown>>;

export type IntrospectionNodeKind = 'component' | 'empty' | 'fragment' | 'host' | 'opaque' | 'text';

export type IntrospectionNotRenderedReason = 'depth' | 'errored' | 'suspended' | 'unsupported';

export type IntrospectionFakeRefNode<Node = Record<PropertyKey, unknown>> = Node;

export type IntrospectionRefTarget<Props = unknown, Type = unknown> = {
    readonly key: string | null;
    readonly name: string;
    readonly props: Props;
    readonly type: Type;
};

export type IntrospectionRefSelector<
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema,
    Type = unknown,
    Props = IntrospectionNodeProps<Type, HostSchema>
> = {
    readonly key?: React.Key | null;
    readonly props?: IntrospectionPartial<Props>;
    readonly type?: Type;
    readonly where?: (target: IntrospectionRefTarget<Props, Type>) => boolean;
};

type RefNodeFactory<Props, Type> = (target: IntrospectionRefTarget<Props, Type>) => IntrospectionFakeRefNode;

export type IntrospectionRefRule<
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema,
    Type = unknown,
    Props = IntrospectionNodeProps<Type, HostSchema>
> = IntrospectionRefSelector<HostSchema, Type, Props> & {
    readonly node: IntrospectionFakeRefNode | RefNodeFactory<Props, Type>;
};

export type IntrospectionRefMatcher<HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema> = {
    readonly rules: readonly IntrospectionRefRule<HostSchema>[];
    readonly type: 'matchRefs';
};

export type IntrospectionRefShorthand = Readonly<Record<string, IntrospectionFakeRefNode>>;

type RefMatcher<HostSchema extends IntrospectionHostSchema> = IntrospectionRefMatcher<HostSchema>;

type RefConfiguration<HostSchema extends IntrospectionHostSchema> = IntrospectionRefShorthand | RefMatcher<HostSchema>;

export type IntrospectionRefs<HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema> = RefConfiguration<
    HostSchema
>;

type RenderedChildNodes<HostSchema extends IntrospectionHostSchema> = {
    readonly nodes: IntrospectionList<unknown, unknown, HostSchema>;
    readonly status: 'rendered';
};

type NotRenderedChildren = {
    readonly reason: IntrospectionNotRenderedReason;
    readonly status: 'notRendered';
};

type IntrospectionCallable = (...parameters: readonly never[]) => unknown;

type IntrospectionPartialArray<Item> = readonly IntrospectionPartial<Item>[];

type IntrospectionPartialObject<Value> = {
    readonly [Key in keyof Value]?: IntrospectionPartial<Value[Key]>;
};

type IntrospectionPartialValue<Value> = Value extends IntrospectionCallable ? Value
    : IntrospectionPartialCollection<Value>;

type IntrospectionPartialCollection<Value> = Value extends readonly (infer Item)[] ? IntrospectionPartialArray<Item>
    : IntrospectionPartialObject<Value>;

type IntrospectionMemoProps<Component> = Component extends React.JSXElementConstructor<infer Props> ? Props : unknown;

type IntrospectionComponentProps<Type> = Type extends React.MemoExoticComponent<infer Component>
    ? IntrospectionMemoProps<Component>
    : IntrospectionForwardRefProps<Type>;

type IntrospectionForwardRefProps<Type> = Type extends React.ForwardRefExoticComponent<infer Props> ? Props : unknown;

export type RenderedChildren<
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = NotRenderedChildren | RenderedChildNodes<HostSchema>;

export type GivenChildren<HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema> = IntrospectionList<
    unknown,
    unknown,
    HostSchema
>;

export type IntrospectionSelector<
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema,
    Props = unknown,
    Type = unknown
> = {
    readonly has?: IntrospectionSelector<HostSchema>;
    readonly key?: React.Key | null;
    readonly props?: IntrospectionPartial<Props>;
    readonly textContent?: RegExp | string;
    readonly type?: Type;
    readonly where?: (node: IntrospectionNode<Props, Type, HostSchema>) => boolean;
};

type IntrospectionPrimitive = bigint | boolean | number | string | symbol | null | undefined;

type IntrospectionPartial<Value> = Value extends IntrospectionPrimitive ? Value : IntrospectionPartialValue<Value>;

type IntrospectionNodeProps<
    Type,
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = Type extends string ? IntrospectionHostProps<HostSchema, Type>
    : IntrospectionPublicProps<IntrospectionElementProps<Type>>;

type IntrospectionHostProps<
    HostSchema extends IntrospectionHostSchema,
    Type extends string
> = Type extends keyof HostSchema ? HostSchema[Type] : unknown;

type IntrospectionElementProps<Type> = Type extends React.JSXElementConstructor<infer Props> ? Props
    : IntrospectionComponentProps<Type>;

type IntrospectionWithoutKeys<Value, Keys extends PropertyKey> = {
    readonly [Key in keyof Value as Key extends Keys ? never : Key]: Value[Key];
};

type IntrospectionPublicProps<Props> = unknown extends Props ? unknown : IntrospectionWithoutKeys<Props, 'children'>;

type IntrospectionTypedSelector<
    HostSchema extends IntrospectionHostSchema,
    QueryType
> = IntrospectionSelector<HostSchema, IntrospectionNodeProps<QueryType, HostSchema>, QueryType> & {
    readonly type: QueryType;
};

type IntrospectionFind<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionNode<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionNode<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionNode<unknown, unknown, HostSchema> | undefined;
};

type IntrospectionFindAll<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionList<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionList<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionList<unknown, unknown, HostSchema>;
};

type IntrospectionFindClosest<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionNode<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionNode<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionNode<unknown, unknown, HostSchema> | undefined;
};

type IntrospectionFilterBy<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionList<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionList<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionList<unknown, unknown, HostSchema>;
};

type IntrospectionLocate<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionLocator<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionLocator<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionLocator<unknown, unknown, HostSchema>;
};

type IntrospectionLocateAll<HostSchema extends IntrospectionHostSchema> = {
    <QueryType extends string>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionListLocator<IntrospectionHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: IntrospectionTypedSelector<HostSchema, QueryType> | QueryType
    ): IntrospectionListLocator<IntrospectionNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: IntrospectionSelector<HostSchema>): IntrospectionListLocator<unknown, unknown, HostSchema>;
};

export type IntrospectionNode<
    Props = unknown,
    NodeType = unknown,
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = {
    readonly error: IntrospectionError | undefined;
    readonly givenChildren: GivenChildren<HostSchema>;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly kind: IntrospectionNodeKind;
    readonly name: string;
    readonly path: string;
    readonly props: Props;
    readonly renderedChildren: RenderedChildren<HostSchema>;
    readonly state: IntrospectionNodeState;
    readonly textContent: string;
    readonly type: NodeType;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly find: IntrospectionFind<HostSchema>;
    readonly findAll: IntrospectionFindAll<HostSchema>;
    readonly findClosest: IntrospectionFindClosest<HostSchema>;
    readonly formatTree: () => string;
    readonly omitProps: <Key extends keyof Props>(keys: readonly Key[]) => IntrospectionWithoutKeys<Props, Key>;
    readonly pickProps: <Key extends keyof Props>(keys: readonly Key[]) => Pick<Props, Key>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type IntrospectionList<
    Props = unknown,
    Type = unknown,
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = Iterable<IntrospectionNode<Props, Type, HostSchema>> & {
    readonly first: IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly last: IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly filterBy: IntrospectionFilterBy<HostSchema>;
};

export type IntrospectionLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = {
    readonly exists: boolean;
    readonly key: string | null | undefined;
    readonly kind: IntrospectionNodeKind | undefined;
    readonly name: string | undefined;
    readonly node: IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly props: Props | undefined;
    readonly textContent: string | undefined;
    readonly type: Type | undefined;
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly omitProps: <Key extends keyof Props>(
        keys: readonly Key[]
    ) => IntrospectionWithoutKeys<Props, Key> | undefined;
    readonly pickProps: <Key extends keyof Props>(keys: readonly Key[]) => Pick<Props, Key> | undefined;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type IntrospectionListLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema
> = Iterable<IntrospectionNode<Props, Type, HostSchema>> & {
    readonly first: IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly last: IntrospectionNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => IntrospectionNode<Props, Type, HostSchema> | undefined;
};

export type IntrospectionView<HostSchema extends IntrospectionHostSchema = IntrospectionHostSchema> = {
    readonly errors: readonly IntrospectionError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: IntrospectionList<unknown, unknown, HostSchema>;
    readonly root: IntrospectionNode<unknown, unknown, HostSchema> | undefined;
    readonly textContent: string;
    readonly warnings: readonly IntrospectionWarning[];
    readonly find: IntrospectionFind<HostSchema>;
    readonly findAll: IntrospectionFindAll<HostSchema>;
    readonly formatTree: () => string;
    readonly locate: IntrospectionLocate<HostSchema>;
    readonly locateAll: IntrospectionLocateAll<HostSchema>;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};
