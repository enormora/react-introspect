import { readHostKey, readInternalHost, readPublicHostProps } from '../../render/protocol/introspect-host-protocol.ts';
import type { IntrospectionRefs } from '../../public/introspect-public-types.ts';
import {
    type IntrospectionRefHostTarget,
    resolveIntrospectionRef,
    validateIntrospectionRefs
} from '../../refs/introspect-ref.ts';
import {
    createEmptyIntrospectionSnapshot,
    type IntrospectionSnapshot,
    type SnapshotSourceNode
} from '../../snapshot/model/introspect-snapshot-contract.ts';
import { createIntrospectionSnapshotFromSource } from '../../snapshot/model/introspect-snapshot.ts';
import { toSnapshotSourceNodes, toSourceOutput } from '../../snapshot/model/introspect-snapshot-source-mapping.ts';
import type { IntrospectionIdNormalization } from '../../snapshot/normalization/introspect-id-normalization.ts';

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

type ProjectedHostChild = ProjectedHostInstance | ProjectedTextInstance;

type ProjectedHostContainer = {
    readonly idNormalization: IntrospectionIdNormalization;
    readonly readChildren: () => readonly ProjectedHostChild[];
    readonly readMounted: () => boolean;
    readonly readNextRenderCount: () => number;
};

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

function toSourceNode(child: ProjectedHostChild): SnapshotSourceNode {
    if (child.kind === 'text') {
        return { kind: 'text', value: child.readText(), hostVisibility: child.readVisibility() };
    }

    const internalHost = readInternalHost(child.type, child.readProps());

    if (internalHost.kind === 'empty' || internalHost.kind === 'opaque') {
        return { kind: internalHost.kind, value: internalHost.value, hostVisibility: child.readVisibility() };
    }

    if (internalHost.kind === 'component') {
        const { metadata } = internalHost;

        return {
            activityMode: metadata.activityMode,
            caughtError: metadata.caughtError,
            givenChildren: toSnapshotSourceNodes(metadata.givenChildren),
            kind: 'element',
            key: metadata.key,
            props: metadata.props,
            output: toSourceOutput(metadata.renderStatus, child.readChildren().map(toSourceNode)),
            type: metadata.type,
            hostVisibility: child.readVisibility()
        };
    }

    return {
        activityMode: undefined,
        caughtError: undefined,
        givenChildren: child.readChildren().map(toSourceNode),
        kind: 'element',
        key: readHostKey(child.readProps()),
        props: readPublicHostProps(child.readProps()),
        output: { children: 'given', status: 'rendered' },
        type: child.type,
        hostVisibility: child.readVisibility()
    };
}

export function createHostSnapshot(container: ProjectedHostContainer): IntrospectionSnapshot {
    if (!container.readMounted()) {
        return createEmptyIntrospectionSnapshot(container.readNextRenderCount());
    }

    return createIntrospectionSnapshotFromSource(
        container.readChildren().map(toSourceNode),
        container.readNextRenderCount(),
        container.idNormalization
    );
}
