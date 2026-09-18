import type React from 'react';
import type {
    ProbeError,
    ProbeNodeState,
    ProbeNotRenderedReason,
    ProbeOptions,
    ProbeWarning
} from './probe-public-types.ts';

type RuntimeRenderedChildNodes = {
    readonly nodes: RuntimeProbeList;
    readonly status: 'rendered';
};

type RuntimeNotRenderedChildren = {
    readonly reason: ProbeNotRenderedReason;
    readonly status: 'notRendered';
};

export type RuntimeRenderedChildren = RuntimeNotRenderedChildren | RuntimeRenderedChildNodes;

export type RuntimeProbeNode = {
    readonly error: ProbeError | undefined;
    readonly givenChildren: RuntimeProbeList;
    readonly isStale: boolean;
    readonly key: string | null;
    readonly name: string;
    readonly path: string;
    readonly props: Readonly<Record<PropertyKey, unknown>>;
    readonly renderedChildren: RuntimeRenderedChildren;
    readonly state: ProbeNodeState;
    readonly textContent: string;
    readonly type: unknown;
    readonly visibility: 'hidden' | 'notRendered' | 'visible';
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly find: (selector: unknown) => RuntimeProbeNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeProbeList;
    readonly findClosest: (selector: unknown) => RuntimeProbeNode | undefined;
    readonly formatTree: () => string;
    readonly omitProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly pickProps: (keys: readonly PropertyKey[]) => Readonly<Record<PropertyKey, unknown>>;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeProbeList = Iterable<RuntimeProbeNode> & {
    readonly first: RuntimeProbeNode | undefined;
    readonly last: RuntimeProbeNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeProbeNode | undefined;
    readonly filterBy: (selector: unknown) => RuntimeProbeList;
};

export type RuntimeProbeLocator = {
    readonly exists: boolean;
    readonly node: RuntimeProbeNode | undefined;
    readonly callProp: (property: PropertyKey, ...parameters: readonly unknown[]) => unknown;
    readonly sendEvent: (name: string, ...parameters: readonly unknown[]) => unknown;
};

export type RuntimeProbeListLocator = Iterable<RuntimeProbeNode> & {
    readonly first: RuntimeProbeNode | undefined;
    readonly last: RuntimeProbeNode | undefined;
    readonly length: number;
    readonly at: (index: number) => RuntimeProbeNode | undefined;
};

export type RuntimeProbeView = {
    readonly errors: readonly ProbeError[];
    readonly hasWarnings: boolean;
    readonly renderCount: number;
    readonly renderedChildren: RuntimeProbeList;
    readonly root: RuntimeProbeNode | undefined;
    readonly textContent: string;
    readonly warnings: readonly ProbeWarning[];
    readonly find: (selector: unknown) => RuntimeProbeNode | undefined;
    readonly findAll: (selector: unknown) => RuntimeProbeList;
    readonly formatTree: () => string;
    readonly locate: (selector: unknown) => RuntimeProbeLocator;
    readonly locateAll: (selector: unknown) => RuntimeProbeListLocator;
    readonly unmount: () => void;
    readonly update: (element: React.ReactElement) => void;
    readonly waitForIdle: () => Promise<void>;
    readonly waitForNextRender: () => Promise<void>;
    readonly waitForRenderCount: (count: number) => Promise<void>;
    readonly waitUntil: (predicate: () => boolean) => Promise<void>;
};

export type RuntimeProbeOptions = ProbeOptions;
