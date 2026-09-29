import type {
    IntrospectionError,
    IntrospectionNodeKind,
    IntrospectionNotRenderedReason
} from '../../public/introspect-public-types.ts';

export type IntrospectionSnapshot = {
    readonly nodes: readonly SnapshotNode[];
    readonly renderCount: number;
    readonly root: SnapshotNode | undefined;
};

export type SnapshotProps = Readonly<Record<PropertyKey, unknown>>;

export type SnapshotNodeKind = IntrospectionNodeKind;

export type SnapshotVisibility = 'hidden' | 'visible';

type SnapshotSourceVisibleNode = SnapshotSourceElement | SnapshotSourceEmpty;

export type SnapshotSourceNode = SnapshotSourceOpaque | SnapshotSourceText | SnapshotSourceVisibleNode;

export type SnapshotSourceElement = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly kind: 'element';
    readonly children: readonly SnapshotSourceNode[];
    readonly caughtError: IntrospectionError | undefined;
    readonly key: string | null;
    readonly props: SnapshotProps;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: unknown;
    readonly visibility: SnapshotVisibility;
    readonly givenChildren: readonly SnapshotSourceNode[];
};

type SnapshotSourceEmpty = {
    readonly kind: 'empty';
    readonly value: unknown;
    readonly visibility: SnapshotVisibility;
};

type SnapshotSourceOpaque = {
    readonly kind: 'opaque';
    readonly value: unknown;
    readonly visibility: SnapshotVisibility;
};

type SnapshotSourceText = {
    readonly kind: 'text';
    readonly value: bigint | number | string;
    readonly visibility: SnapshotVisibility;
};

export type SnapshotNode = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly caughtError: IntrospectionError | undefined;
    readonly givenChildren: readonly SnapshotNode[];
    readonly id: number;
    readonly key: string | null;
    readonly kind: SnapshotNodeKind;
    readonly name: string;
    readonly parentId: number | undefined;
    readonly path: string;
    readonly props: SnapshotProps;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly textContent: string;
    readonly type: unknown;
    readonly visibility: SnapshotVisibility;
};

export function createEmptyIntrospectionSnapshot(renderCount: number): IntrospectionSnapshot {
    return Object.freeze({
        nodes: Object.freeze([]),
        renderCount,
        root: undefined
    });
}

const snapshotNodes = new WeakSet();

export function registerSnapshotNode(node: SnapshotNode): SnapshotNode {
    snapshotNodes.add(node);

    return node;
}

export function isSnapshotNode(value: unknown): value is SnapshotNode {
    return typeof value === 'object' && value !== null && snapshotNodes.has(value);
}
