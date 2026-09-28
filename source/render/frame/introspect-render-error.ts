import { isObjectOrFunction, isThenable } from '../../values/introspect-value-kinds.ts';

const introspectionRenderErrors = new WeakSet();

export function throwIntrospectionRenderError(error: unknown): never {
    if (isObjectOrFunction(error) && !isThenable(error)) {
        introspectionRenderErrors.add(error);
    }

    throw error;
}

export function isIntrospectionRenderError(error: unknown): boolean {
    return isObjectOrFunction(error) && introspectionRenderErrors.has(error);
}
