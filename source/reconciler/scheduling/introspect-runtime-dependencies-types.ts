import type { Clock } from '@enormora/clock';

export type IntrospectionMacrotasks = {
    readonly waitForNext: () => Promise<void>;
};

export type IntrospectionRuntimeDependencies = {
    readonly clock: Clock;
    readonly macrotasks: IntrospectionMacrotasks;
};
