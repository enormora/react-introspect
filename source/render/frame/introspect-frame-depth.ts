type IntrospectionDepthBudget = number | 'full';

type IntrospectionDepthPolicy = {
    readonly depthFrom: unknown;
    readonly transparent: ReadonlySet<unknown>;
};

export type IntrospectionFrameDepth = {
    readonly budget: IntrospectionDepthBudget;
    readonly counting: boolean;
    readonly policy: IntrospectionDepthPolicy;
};

export type IntrospectionDepthOptions = {
    readonly budget: IntrospectionDepthBudget;
    readonly depthFrom: unknown;
    readonly transparent: readonly unknown[];
};

export function createFrameDepth(options: IntrospectionDepthOptions): IntrospectionFrameDepth {
    return {
        budget: options.budget,
        counting: options.depthFrom === undefined,
        policy: {
            depthFrom: options.depthFrom,
            transparent: new Set(options.transparent)
        }
    };
}

export function enterComponentDepth(depth: IntrospectionFrameDepth, type: unknown): IntrospectionFrameDepth {
    return !depth.counting && type === depth.policy.depthFrom ? { ...depth, counting: true } : depth;
}

function consumesDepth(depth: IntrospectionFrameDepth, type: unknown): boolean {
    return depth.counting && !depth.policy.transparent.has(type);
}

export function canExecuteComponent(depth: IntrospectionFrameDepth, type: unknown): boolean {
    return !consumesDepth(depth, type) || depth.budget === 'full' || depth.budget > 0;
}

export function nextDepth(depth: IntrospectionFrameDepth, type: unknown): IntrospectionFrameDepth {
    if (!consumesDepth(depth, type) || depth.budget === 'full') {
        return depth;
    }

    return { ...depth, budget: Math.max(0, depth.budget - 1) };
}
