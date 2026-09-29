import type {
    IntrospectionError,
    IntrospectionHiddenReason,
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
    readonly hostVisibility: SnapshotVisibility;
    readonly givenChildren: readonly SnapshotSourceNode[];
};

type SnapshotSourceEmpty = {
    readonly kind: 'empty';
    readonly value: unknown;
    readonly hostVisibility: SnapshotVisibility;
};

type SnapshotSourceOpaque = {
    readonly kind: 'opaque';
    readonly value: unknown;
    readonly hostVisibility: SnapshotVisibility;
};

type SnapshotSourceText = {
    readonly kind: 'text';
    readonly value: bigint | number | string;
    readonly hostVisibility: SnapshotVisibility;
};

type SnapshotPlacedVisible = {
    readonly visibility: 'visible';
};

type SnapshotPlacedHidden = {
    readonly visibility: 'hidden';
    readonly hiddenBy: IntrospectionHiddenReason;
};

export type SnapshotPlacement = SnapshotPlacedHidden | SnapshotPlacedVisible;

type SnapshotRendered = SnapshotPlacement & {
    readonly status: 'rendered';
};

type SnapshotBelowDepth = SnapshotPlacement & {
    readonly status: 'notRendered';
    readonly reason: 'depth';
};

type SnapshotUnsupported = {
    readonly status: 'notRendered';
    readonly reason: 'unsupported';
};

export type SnapshotNotRendered = SnapshotBelowDepth | SnapshotUnsupported;

export type SnapshotRender = SnapshotNotRendered | SnapshotRendered;

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
    readonly render: SnapshotRender;
    readonly renderedChildren: readonly SnapshotNode[];
    readonly textContent: string;
    readonly type: unknown;
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
