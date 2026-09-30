import { readHostKey, readInternalHost, readPublicHostProps } from '../../render/protocol/introspect-host-protocol.ts';
import type { IntrospectionRefs } from '../../public/introspect-public-types.ts';
import {
    type IntrospectionRefHostTarget,
    resolveIntrospectionRef,
    validateIntrospectionRefs
} from '../../refs/introspect-ref.ts';

type ProjectedHostProps = Readonly<Record<PropertyKey, unknown>>;

type ProjectedHostInstance = {
    readonly kind: 'host';
    readonly readChildren: () => readonly ProjectedHostChild[];
    readonly readProps: () => ProjectedHostProps;
    readonly readVisibility: () => 'hidden' | 'visible';
    readonly type: string;
};

type ProjectedTextInstance = {
    readonly kind: 'text';
    readonly readText: () => string;
    readonly readVisibility: () => 'hidden' | 'visible';
};

export type ProjectedHostChild = ProjectedHostInstance | ProjectedTextInstance;

function toRefTarget(type: string, props: ProjectedHostProps): IntrospectionRefHostTarget {
    return Object.freeze({
        key: readHostKey(props),
        name: type,
        props: readPublicHostProps(props),
        type
    });
}

export function resolvePublicInstance(
    refs: IntrospectionRefs | undefined,
    type: string,
    props: ProjectedHostProps
): unknown {
    if (readInternalHost(type, props).kind !== 'host') {
        return null;
    }

    return resolveIntrospectionRef(refs, toRefTarget(type, props));
}

function collectRefTargets(child: ProjectedHostChild): readonly IntrospectionRefHostTarget[] {
    if (child.kind === 'text') {
        return [];
    }

    const childTargets = child.readChildren().flatMap(collectRefTargets);

    if (readInternalHost(child.type, child.readProps()).kind !== 'host') {
        return childTargets;
    }

    return [
        toRefTarget(child.type, child.readProps()),
        ...childTargets
    ];
}

export function validateHostRefs(refs: IntrospectionRefs | undefined, children: readonly ProjectedHostChild[]): void {
    validateIntrospectionRefs(refs, children.flatMap(collectRefTargets));
}
