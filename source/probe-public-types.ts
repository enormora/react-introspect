import type React from 'react';

export type ProbeWarning = {
    readonly message: string;
    readonly cause: unknown;
};

export type ProbeError = {
    readonly message: string;
    readonly cause: unknown;
    readonly handled: boolean;
};

export type ProbeNodeState = {
    readonly rendered: boolean;
    readonly visible: boolean;
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly reason: ProbeNotRenderedReason | 'activity' | undefined;
};

export type ProbeOptions<HostSchema extends ProbeHostSchema = ProbeHostSchema> = {
    readonly depth?: number | 'full';
    readonly errorMode?: 'capture' | 'throw';
    readonly hostSchema?: HostSchema;
    readonly idGenerator?: ((generatedId: string) => string) | undefined;
    readonly idPrefix?: string | undefined;
    readonly refs?: unknown;
    readonly strictMode?: boolean;
    readonly waitTimeout?: number;
    readonly warningMode?: 'capture' | 'ignore' | 'throw';
};

export type ProbeHostSchema = Readonly<Record<string, unknown>>;

export type ProbeNotRenderedReason = 'depth' | 'errored' | 'suspended' | 'unsupported';

type RenderedChildNodes<HostSchema extends ProbeHostSchema> = {
    readonly nodes: ProbeList<unknown, unknown, HostSchema>;
    readonly status: 'rendered';
};

type NotRenderedChildren = {
    readonly reason: ProbeNotRenderedReason;
    readonly status: 'notRendered';
};

type ProbeCallable = (...parameters: readonly never[]) => unknown;

type ProbePartialArray<Item> = readonly ProbePartial<Item>[];

type ProbePartialObject<Value> = {
    readonly [Key in keyof Value]?: ProbePartial<Value[Key]>;
};

type ProbePartialValue<Value> = Value extends ProbeCallable ? Value : ProbePartialCollection<Value>;

type ProbePartialCollection<Value> = Value extends readonly (infer Item)[] ? ProbePartialArray<Item>
    : ProbePartialObject<Value>;

type ProbeMemoProps<Component> = Component extends React.JSXElementConstructor<infer Props> ? Props : unknown;

type ProbeComponentProps<Type> = Type extends React.MemoExoticComponent<infer Component> ? ProbeMemoProps<Component>
    : ProbeForwardRefProps<Type>;

type ProbeForwardRefProps<Type> = Type extends React.ForwardRefExoticComponent<infer Props> ? Props : unknown;

export type RenderedChildren<
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = NotRenderedChildren | RenderedChildNodes<HostSchema>;

export type GivenChildren<HostSchema extends ProbeHostSchema = ProbeHostSchema> = ProbeList<
    unknown,
    unknown,
    HostSchema
>;

export type ProbeSelector<
    HostSchema extends ProbeHostSchema = ProbeHostSchema,
    Props = unknown,
    Type = unknown
> = {
    readonly has?: ProbeSelector<HostSchema>;
    readonly key?: React.Key | null;
    readonly props?: ProbePartial<Props>;
    readonly textContent?: RegExp | string;
    readonly type?: Type;
    readonly where?: (node: ProbeNode<Props, Type, HostSchema>) => boolean;
};

type ProbePrimitive = bigint | boolean | number | string | symbol | null | undefined;

type ProbePartial<Value> = Value extends ProbePrimitive ? Value : ProbePartialValue<Value>;

type ProbeNodeProps<
    Type,
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = Type extends string ? ProbeHostProps<HostSchema, Type> : ProbePublicProps<ProbeElementProps<Type>>;

type ProbeHostProps<
    HostSchema extends ProbeHostSchema,
    Type extends string
> = Type extends keyof HostSchema ? HostSchema[Type] : unknown;

type ProbeElementProps<Type> = Type extends React.JSXElementConstructor<infer Props> ? Props
    : ProbeComponentProps<Type>;

type ProbeWithoutKeys<Value, Keys extends PropertyKey> = {
    readonly [Key in keyof Value as Key extends Keys ? never : Key]: Value[Key];
};

type ProbePublicProps<Props> = unknown extends Props ? unknown : ProbeWithoutKeys<Props, 'children'>;

type ProbeTypedSelector<
    HostSchema extends ProbeHostSchema,
    QueryType
> = ProbeSelector<HostSchema, ProbeNodeProps<QueryType, HostSchema>, QueryType> & {
    readonly type: QueryType;
};

type ProbeFind<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeNode<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeNode<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: ProbeSelector<HostSchema>): ProbeNode<unknown, unknown, HostSchema> | undefined;
};

type ProbeFindAll<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeList<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeList<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ProbeSelector<HostSchema>): ProbeList<unknown, unknown, HostSchema>;
};

type ProbeFindClosest<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeNode<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema> | undefined;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeNode<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema> | undefined;
    (selector: ProbeSelector<HostSchema>): ProbeNode<unknown, unknown, HostSchema> | undefined;
};

type ProbeFilterBy<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeList<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeList<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ProbeSelector<HostSchema>): ProbeList<unknown, unknown, HostSchema>;
};

type ProbeLocate<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeLocator<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeLocator<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ProbeSelector<HostSchema>): ProbeLocator<unknown, unknown, HostSchema>;
};

type ProbeLocateAll<HostSchema extends ProbeHostSchema> = {
    <QueryType extends string>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeListLocator<ProbeHostProps<HostSchema, QueryType>, QueryType, HostSchema>;
    <QueryType>(
        selector: ProbeTypedSelector<HostSchema, QueryType> | QueryType
    ): ProbeListLocator<ProbeNodeProps<QueryType, HostSchema>, QueryType, HostSchema>;
    (selector: ProbeSelector<HostSchema>): ProbeListLocator<unknown, unknown, HostSchema>;
};

export type ProbeNode<
    Props = unknown,
    NodeType = unknown,
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = {
    readonly error: ProbeError | undefined;
    readonly givenChildren: GivenChildren<HostSchema>;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly name: string;
    readonly path: string;
    readonly props: Props;
    readonly renderedChildren: RenderedChildren<HostSchema>;
    readonly state: ProbeNodeState;
    readonly textContent: string;
    readonly type: NodeType;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly find: ProbeFind<HostSchema>;
    readonly findAll: ProbeFindAll<HostSchema>;
    readonly findClosest: ProbeFindClosest<HostSchema>;
    readonly formatTree: () => string;
    readonly omitProps: <Key extends keyof Props>(keys: readonly Key[]) => ProbeWithoutKeys<Props, Key>;
    readonly pickProps: <Key extends keyof Props>(keys: readonly Key[]) => Pick<Props, Key>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type ProbeList<
    Props = unknown,
    Type = unknown,
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = Iterable<ProbeNode<Props, Type, HostSchema>> & {
    readonly first: ProbeNode<Props, Type, HostSchema> | undefined;
    readonly last: ProbeNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => ProbeNode<Props, Type, HostSchema> | undefined;
    readonly filterBy: ProbeFilterBy<HostSchema>;
};

export type ProbeLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = {
    readonly exists: boolean;
    readonly node: ProbeNode<Props, Type, HostSchema> | undefined;
    readonly callProp: <Property extends keyof Props>(
        property: Property,
        ...parameters: Props[Property] extends (...callParameters: infer Parameters) => unknown ? Parameters
            : readonly never[]
    ) => Props[Property] extends (...callParameters: readonly never[]) => infer Result ? Result : unknown;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type ProbeListLocator<
    Props = unknown,
    Type = unknown,
    HostSchema extends ProbeHostSchema = ProbeHostSchema
> = Iterable<ProbeNode<Props, Type, HostSchema>> & {
    readonly first: ProbeNode<Props, Type, HostSchema> | undefined;
    readonly last: ProbeNode<Props, Type, HostSchema> | undefined;
    readonly length: number;
    readonly at: (index: number) => ProbeNode<Props, Type, HostSchema> | undefined;
};

export type ProbeView<HostSchema extends ProbeHostSchema = ProbeHostSchema> = {
    readonly errors: readonly ProbeError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: ProbeList<unknown, unknown, HostSchema>;
    readonly root: ProbeNode<unknown, unknown, HostSchema> | undefined;
    readonly textContent: string;
    readonly warnings: readonly ProbeWarning[];
    readonly find: ProbeFind<HostSchema>;
    readonly findAll: ProbeFindAll<HostSchema>;
    readonly formatTree: () => string;
    readonly locate: ProbeLocate<HostSchema>;
    readonly locateAll: ProbeLocateAll<HostSchema>;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};
