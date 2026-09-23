import type React from 'react';

export type ReflectWarning = {
    readonly message: string;
    readonly cause: unknown;
};

export type ReflectError = {
    readonly message: string;
    readonly cause: unknown;
    readonly handled: boolean;
};

export type ReflectNodeState = {
    readonly rendered: boolean;
    readonly visible: boolean;
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly reason: ReflectNotRenderedReason | 'activity' | undefined;
};

export type ReflectOptions<HostSchema extends ReflectHostSchema = ReflectHostSchema> = {
    readonly depth?: number | 'full';
    readonly errorMode?: 'capture' | 'throw';
    readonly hostSchema?: HostSchema;
    readonly idGenerator?: ((generatedId: string) => string) | undefined;
    readonly idPrefix?: string | undefined;
    readonly refs?: ReflectRefs<HostSchema> | undefined;
    readonly strictMode?: boolean;
    readonly waitTimeout?: number;
    readonly warningMode?: 'capture' | 'ignore' | 'throw';
};

export type ReflectHostSchema = Readonly<Record<string, unknown>>;

export type ReflectNotRenderedReason = 'depth' | 'errored' | 'suspended' | 'unsupported';

export type ReflectFakeRefNode<Node = Record<PropertyKey, unknown>> = Node;

export type ReflectRefTarget<Props = unknown, Type = unknown> = {
    readonly key: string | null;
    readonly name: string;
    readonly props: Props;
    readonly type: Type;
};

export type ReflectRefSelector<
    HostSchema extends ReflectHostSchema = ReflectHostSchema,
    Type = unknown,
    Props = ReflectNodeProps<Type, HostSchema>
> = {
    readonly key?: React.Key | null;
    readonly props?: ReflectPartial<Props>;
    readonly type?: Type;
    readonly where?: (target: ReflectRefTarget<Props, Type>) => boolean;
};

export type ReflectRefRule<
    HostSchema extends ReflectHostSchema = ReflectHostSchema,
    Type = unknown,
    Props = ReflectNodeProps<Type, HostSchema>
> = ReflectRefSelector<HostSchema, Type, Props> & {
    readonly node: ReflectFakeRefNode | ((target: ReflectRefTarget<Props, Type>) => ReflectFakeRefNode);
};

export type ReflectRefMatcher<HostSchema extends ReflectHostSchema = ReflectHostSchema> = {
    readonly rules: readonly ReflectRefRule<HostSchema>[];
    readonly type: 'matchRefs';
};

export type ReflectRefShorthand = Readonly<Record<string, ReflectFakeRefNode>>;

type RefConfiguration<HostSchema extends ReflectHostSchema> = ReflectRefMatcher<HostSchema> | ReflectRefShorthand;

export type ReflectRefs<HostSchema extends ReflectHostSchema = ReflectHostSchema> = RefConfiguration<HostSchema>;

type RenderedChildNodes<HostSchema extends ReflectHostSchema> = {
    readonly nodes: ReflectList<unknown, unknown, HostSchema>;
    readonly status: 'rendered';
};

type NotRenderedChildren = {
    readonly reason: ReflectNotRenderedReason;
    readonly status: 'notRendered';
};

type ReflectCallable = (...parameters: readonly never[]) => unknown;

type ReflectPartialArray<Item> = readonly ReflectPartial<Item>[];

type ReflectPartialObject<Value> = {
    readonly [Key in keyof Value]?: ReflectPartial<Value[Key]>;
};

type ReflectPartialValue<Value> = Value extends ReflectCallable ? Value : ReflectPartialCollection<Value>;

type ReflectPartialCollection<Value> = Value extends readonly (infer Item)[] ? ReflectPartialArray<Item>
    : ReflectPartialObject<Value>;

type ReflectMemoProps<Component> = Component extends React.JSXElementConstructor<infer Props> ? Props : unknown;

type ReflectComponentProps<Type> = Type extends React.MemoExoticComponent<infer Component> ? ReflectMemoProps<Component>
    : ReflectForwardRefProps<Type>;

type ReflectForwardRefProps<Type> = Type extends React.ForwardRefExoticComponent<infer Props> ? Props : unknown;

export type RenderedChildren<
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = NotRenderedChildren | RenderedChildNodes<HostSchema>;

export type GivenChildren<HostSchema extends ReflectHostSchema = ReflectHostSchema> = ReflectList<
    unknown,
    unknown,
    HostSchema
>;

export type ReflectSelector<
    HostSchema extends ReflectHostSchema = ReflectHostSchema,
    Props = unknown,
    Type = unknown
> = {
    readonly has?: ReflectSelector<HostSchema>;
    readonly key?: React.Key | null;
    readonly props?: ReflectPartial<Props>;
    readonly textContent?: RegExp | string;
    readonly type?: Type;
    readonly where?: (node: ReflectNode<Props, Type, HostSchema>) => boolean;
};

type ReflectPrimitive = bigint | boolean | number | string | symbol | null | undefined;

type ReflectPartial<Value> = Value extends ReflectPrimitive ? Value : ReflectPartialValue<Value>;

type ReflectNodeProps<
    Type,
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = Type extends string ? ReflectHostProps<HostSchema, Type> : ReflectPublicProps<ReflectElementProps<Type>>;

type ReflectHostProps<
    HostSchema extends ReflectHostSchema,
    Type extends string
> = Type extends keyof HostSchema ? HostSchema[Type] : unknown;

type ReflectElementProps<Type> = Type extends React.JSXElementConstructor<infer Props> ? Props
    : ReflectComponentProps<Type>;

type ReflectWithoutKeys<Value, Keys extends PropertyKey> = {
    readonly [Key in keyof Value as Key extends Keys ? never : Key]: Value[Key];
};

type ReflectPublicProps<Props> = unknown extends Props ? unknown : ReflectWithoutKeys<Props, 'children'>;

type ReflectTypedSelector<
    HostSchema extends ReflectHostSchema,
    QueryType
> = ReflectSelector<HostSchema, ReflectNodeProps<QueryType, HostSchema>, QueryType> & {
    readonly type: QueryType;
};

type ReflectFind<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectNode<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectNode<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: ReflectSelector<HostSchema>): ReflectNode<unknown, unknown, HostSchema> | undefined;
};

type ReflectFindAll<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectList<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectList<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ReflectSelector<HostSchema>): ReflectList<unknown, unknown, HostSchema>;
};

type ReflectFindClosest<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectNode<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectNode<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: ReflectSelector<HostSchema>): ReflectNode<unknown, unknown, HostSchema> | undefined;
};

type ReflectFilterBy<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectList<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectList<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ReflectSelector<HostSchema>): ReflectList<unknown, unknown, HostSchema>;
};

type ReflectLocate<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectLocator<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectLocator<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ReflectSelector<HostSchema>): ReflectLocator<unknown, unknown, HostSchema>;
};

type ReflectLocateAll<HostSchema extends ReflectHostSchema> = {
    <QueryType extends string>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectListLocator<ReflectHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: QueryType | ReflectTypedSelector<HostSchema, QueryType>
    ): ReflectListLocator<ReflectNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ReflectSelector<HostSchema>): ReflectListLocator<unknown, unknown, HostSchema>;
};

export type ReflectNode<
    Props = unknown,
    NodeType = unknown,
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = {
    readonly error: ReflectError | undefined;
    readonly givenChildren: GivenChildren<HostSchema>;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly name: string;
    readonly path: string;
    readonly props: Props;
    readonly renderedChildren: RenderedChildren<HostSchema>;
    readonly state: ReflectNodeState;
    readonly textContent: string;
    readonly type: NodeType;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly find: ReflectFind<HostSchema>;
    readonly findAll: ReflectFindAll<HostSchema>;
    readonly findClosest: ReflectFindClosest<HostSchema>;
    readonly formatTree: () => string;
    readonly omitProps: <Key extends keyof Props>(keys: readonly Key[]) => ReflectWithoutKeys<Props, Key>;
    readonly pickProps: <Key extends keyof Props>(keys: readonly Key[]) => Pick<Props, Key>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type ReflectList<
    Props = unknown,
    Type = unknown,
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = Iterable<ReflectNode<Props, Type, HostSchema>> & {
    readonly first: ReflectNode<Props, Type, HostSchema> | undefined;
    readonly last: ReflectNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => ReflectNode<Props, Type, HostSchema> | undefined;
    readonly filterBy: ReflectFilterBy<HostSchema>;
};

export type ReflectLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = {
    readonly exists: boolean;
    readonly node: ReflectNode<Props, Type, HostSchema> | undefined;
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type ReflectListLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends ReflectHostSchema = ReflectHostSchema
> = Iterable<ReflectNode<Props, Type, HostSchema>> & {
    readonly first: ReflectNode<Props, Type, HostSchema> | undefined;
    readonly last: ReflectNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => ReflectNode<Props, Type, HostSchema> | undefined;
};

export type ReflectView<HostSchema extends ReflectHostSchema = ReflectHostSchema> = {
    readonly errors: readonly ReflectError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: ReflectList<unknown, unknown, HostSchema>;
    readonly root: ReflectNode<unknown, unknown, HostSchema> | undefined;
    readonly textContent: string;
    readonly warnings: readonly ReflectWarning[];
    readonly find: ReflectFind<HostSchema>;
    readonly findAll: ReflectFindAll<HostSchema>;
    readonly formatTree: () => string;
    readonly locate: ReflectLocate<HostSchema>;
    readonly locateAll: ReflectLocateAll<HostSchema>;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};
