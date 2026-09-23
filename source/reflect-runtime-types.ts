import type React from 'react';
import type {
    ReflectError,
    ReflectNodeState,
    ReflectNotRenderedReason,
    ReflectOptions,
    ReflectWarning
} from './reflect-public-types.ts';

type RuntimeRenderedChildNodes = {
    readonly nodes: RuntimeReflectList;
    readonly status: 'rendered';
};

type RuntimeNotRenderedChildren = {
    readonly reason: ReflectNotRenderedReason;
    readonly status: 'notRendered';
};

export type RuntimeRenderedChildren = RuntimeNotRenderedChildren | RuntimeRenderedChildNodes;

export type RuntimeReflectNode = {
    readonly error: ReflectError | undefined;
    readonly givenChildren: RuntimeReflectList;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly name: string;
    readonly path: string;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedChildren: RuntimeRenderedChildren;
    readonly state: ReflectNodeState;
    readonly textContent: string;
    readonly type: unknown;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly find: (selector: unknown) => RuntimeReflectNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeReflectList;
    readonly findClosest: (selector: unknown) => RuntimeReflectNode | undefined;
    readonly formatTree: () => string;
    readonly omitProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly pickProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeReflectList = Iterable<RuntimeReflectNode> & {
    readonly first: RuntimeReflectNode | undefined;
    readonly last: RuntimeReflectNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeReflectNode | undefined;
    readonly filterBy: (selector: unknown) => RuntimeReflectList;
};

export type RuntimeReflectLocator = {
    readonly exists: boolean;
    readonly node: RuntimeReflectNode | undefined;
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeReflectListLocator = Iterable<RuntimeReflectNode> & {
    readonly first: RuntimeReflectNode | undefined;
    readonly last: RuntimeReflectNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeReflectNode | undefined;
};

export type RuntimeReflectView = {
    readonly errors: readonly ReflectError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: RuntimeReflectList;
    readonly root: RuntimeReflectNode | undefined;
    readonly textContent: string;
    readonly warnings: readonly ReflectWarning[];
    readonly find: (selector: unknown) => RuntimeReflectNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeReflectList;
    readonly formatTree: () => string;
    readonly locate: (selector: unknown) => RuntimeReflectLocator;
    readonly locateAll: (selector: unknown) => RuntimeReflectListLocator;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};

export type RuntimeReflectOptions = ReflectOptions;
