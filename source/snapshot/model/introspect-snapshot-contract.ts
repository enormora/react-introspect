import type React from 'react';
import type { IntrospectionIdNormalization } from '../normalization/introspect-id-normalization.ts';
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

type SnapshotSourceElementBase = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly children: readonly SnapshotSourceNode[];
    readonly error: IntrospectionError | undefined;
    readonly key: string | null;
    readonly props: SnapshotProps;
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly type: unknown;
    readonly visibility: SnapshotVisibility;
};

type SnapshotSourceReactElement = SnapshotSourceElementBase & {
    readonly givenChildren: unknown;
    readonly givenChildrenKind: 'react';
};

type SnapshotSourceOwnedElement = SnapshotSourceElementBase & {
    readonly givenChildren: readonly SnapshotSourceNode[];
    readonly givenChildrenKind: 'source';
};

export type SnapshotSourceElement = SnapshotSourceOwnedElement | SnapshotSourceReactElement;

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
    readonly value: string;
    readonly visibility: SnapshotVisibility;
};

export type SnapshotNode = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly error: IntrospectionError | undefined;
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

export type SnapshotBuild = {
    readonly nextId: number;
    readonly nodes: readonly SnapshotNode[];
    readonly normalizeIdString: (value: string) => string;
    readonly valueAncestors: WeakSet<WeakKey>;
};

export type NodeIdAllocation = { readonly build: SnapshotBuild; readonly id: number; };

export type SnapshotNodeInput = {
    readonly activityMode: 'hidden' | 'visible' | undefined;
    readonly error: IntrospectionError | undefined;
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

export type SnapshotNodeRequest = {
    readonly build: SnapshotBuild;
    readonly idNormalization: IntrospectionIdNormalization;
    readonly index: number | string;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly node: unknown;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

export type ElementNodeRequest = SnapshotNodeRequest & {
    readonly element: React.ReactElement<SnapshotProps>;
};

export type SourceElementNodeRequest = SnapshotNodeRequest & {
    readonly element: SnapshotSourceElement;
};

export type ChildSnapshotsRequest = {
    readonly build: SnapshotBuild;
    readonly children: unknown;
    readonly idNormalization: IntrospectionIdNormalization;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

export type SourceChildSnapshotsRequest = {
    readonly build: SnapshotBuild;
    readonly children: readonly SnapshotSourceNode[];
    readonly idNormalization: IntrospectionIdNormalization;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly parentId: number | undefined;
    readonly parentPath: string;
};

export type SourceSnapshotNodeRequest = SnapshotNodeRequest & {
    readonly node: SnapshotSourceNode;
};

export type SourceElementChildrenRequest = {
    readonly build: SnapshotBuild;
    readonly element: SnapshotSourceElement;
    readonly idNormalization: IntrospectionIdNormalization;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly parentId: number;
    readonly parentPath: string;
};

export type SourceElementRenderedChildrenRequest = SourceElementChildrenRequest & {
    readonly givenChildrenResult: ChildSnapshotsResult;
};

export type PropsSnapshotRequest = {
    readonly build: SnapshotBuild;
    readonly idNormalization: IntrospectionIdNormalization;
    readonly inheritedVisibility: SnapshotVisibility;
    readonly ownerId: number;
    readonly ownerPath: string;
    readonly props: SnapshotProps;
};

export type PropsSnapshotResult = {
    readonly build: SnapshotBuild;
    readonly props: SnapshotProps;
};

export type SnapshotNodeResult = {
    readonly build: SnapshotBuild;
    readonly node: SnapshotNode;
};

export type ChildSnapshotsResult = {
    readonly build: SnapshotBuild;
    readonly nodes: readonly SnapshotNode[];
};

export type ElementChildrenState = {
    readonly renderedChildren: readonly SnapshotNode[];
    readonly renderedReason: IntrospectionNotRenderedReason | undefined;
    readonly textContent: string;
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
