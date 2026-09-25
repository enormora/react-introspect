import type { Clock } from '@enormora/clock';

export type IntrospectionActEnvironment = {
    readonly act: (action: () => unknown) => unknown;
};

export type IntrospectionBrowserEnvironment = {
    readonly readDocument: () => unknown;
    readonly readWindow: () => unknown;
};

export type IntrospectionMacrotasks = {
    readonly waitForNext: () => Promise<void>;
};

export type IntrospectionMicrotasks = {
    readonly flush: () => Promise<void>;
    readonly schedule: (action: () => void) => void;
};

export type IntrospectionRuntimeDependencies = {
    readonly actEnvironment: IntrospectionActEnvironment;
    readonly browserEnvironment: IntrospectionBrowserEnvironment;
    readonly clock: Clock;
    readonly macrotasks: IntrospectionMacrotasks;
    readonly microtasks: IntrospectionMicrotasks;
};
