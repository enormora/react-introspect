import type React from 'react';
import type {
    IntrospectionError,
    IntrospectionNodeKind,
    IntrospectionNodeState,
    IntrospectionNotRenderedReason,
    IntrospectionOptions,
    IntrospectionWarning
} from '../../public/introspect-public-types.ts';

type RuntimeRenderedChildNodes = {
    readonly nodes: RuntimeIntrospectionList;
    readonly status: 'rendered';
};

type RuntimeNotRenderedChildren = {
    readonly reason: IntrospectionNotRenderedReason;
    readonly status: 'notRendered';
};

export type RuntimeRenderedChildren = RuntimeNotRenderedChildren | RuntimeRenderedChildNodes;

export type RuntimeIntrospectionNode = {
    readonly error: IntrospectionError | undefined;
    readonly givenChildren: RuntimeIntrospectionList;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly kind: IntrospectionNodeKind;
    readonly name: string;
    readonly path: string;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedChildren: RuntimeRenderedChildren;
    readonly state: IntrospectionNodeState;
    readonly textContent: string;
    readonly type: unknown;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly find: (selector: unknown) => RuntimeIntrospectionNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeIntrospectionList;
    readonly findClosest: (selector: unknown) => RuntimeIntrospectionNode | undefined;
    readonly formatTree: () => string;
    readonly omitProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly pickProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeIntrospectionList = Iterable<RuntimeIntrospectionNode> & {
    readonly first: RuntimeIntrospectionNode | undefined;
    readonly last: RuntimeIntrospectionNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeIntrospectionNode | undefined;
    readonly filterBy: (selector: unknown) => RuntimeIntrospectionList;
};

export type RuntimeIntrospectionLocator = {
    readonly exists: boolean;
    readonly key: string | null | undefined;
    readonly kind: IntrospectionNodeKind | undefined;
    readonly name: string | undefined;
    readonly node: RuntimeIntrospectionNode | undefined;
    readonly props: Readonly<Record<PropertyKey, unknown>> | undefined;
    readonly textContent: string | undefined;
    readonly type: unknown;
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly omitProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>> | undefined;
    readonly pickProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>> | undefined;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeIntrospectionListLocator = Iterable<RuntimeIntrospectionNode> & {
    readonly first: RuntimeIntrospectionNode | undefined;
    readonly last: RuntimeIntrospectionNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeIntrospectionNode | undefined;
};

export type RuntimeIntrospectionView = {
    readonly errors: readonly IntrospectionError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: RuntimeIntrospectionList;
    readonly root: RuntimeIntrospectionNode | undefined;
    readonly textContent: string;
    readonly warnings: readonly IntrospectionWarning[];
    readonly find: (selector: unknown) => RuntimeIntrospectionNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeIntrospectionList;
    readonly formatTree: () => string;
    readonly locate: (selector: unknown) => RuntimeIntrospectionLocator;
    readonly locateAll: (selector: unknown) => RuntimeIntrospectionListLocator;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};

export type RuntimeIntrospectionOptions = IntrospectionOptions;
