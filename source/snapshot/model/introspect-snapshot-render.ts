import type {
    IntrospectionHiddenReason,
    IntrospectionNode,
    IntrospectionNodeState,
    IntrospectionNotRenderedReason
} from '../../public/introspect-public-types.ts';
import type {
    SnapshotNotRendered,
    SnapshotPlacement,
    SnapshotRender,
    SnapshotSourceRenderStatus,
    SnapshotVisibility
} from './introspect-snapshot-contract.ts';

type SnapshotRenderDescription = Pick<IntrospectionNodeState, 'reason' | 'rendered'> & {
    readonly visibility: IntrospectionNode['visibility'];
};

export function hiddenByFromSource(
    inheritedHiddenBy: IntrospectionHiddenReason | undefined,
    sourceVisibility: SnapshotVisibility,
    activityMode: 'hidden' | 'visible' | undefined
): IntrospectionHiddenReason | undefined {
    if (inheritedHiddenBy !== undefined) {
        return inheritedHiddenBy;
    }

    if (sourceVisibility === 'hidden') {
        return 'suspended';
    }

    return activityMode === 'hidden' ? 'activity' : undefined;
}

function placementFromSource(hiddenBy: IntrospectionHiddenReason | undefined): SnapshotPlacement {
    return hiddenBy === undefined ? { visibility: 'visible' } : { hiddenBy, visibility: 'hidden' };
}

const notRenderedFromSource: Readonly<
    Record<IntrospectionNotRenderedReason, (hiddenBy: IntrospectionHiddenReason | undefined) => SnapshotNotRendered>
> = {
    depth(hiddenBy) {
        return { ...placementFromSource(hiddenBy), reason: 'depth', status: 'notRendered' };
    },
    unsupported() {
        return { reason: 'unsupported', status: 'notRendered' };
    }
};

export function renderFromSource(
    renderStatus: SnapshotSourceRenderStatus,
    hiddenBy: IntrospectionHiddenReason | undefined
): SnapshotRender {
    return renderStatus.status === 'rendered'
        ? { ...placementFromSource(hiddenBy), status: 'rendered' }
        : notRenderedFromSource[renderStatus.reason](hiddenBy);
}

export function describeRender(render: SnapshotRender): SnapshotRenderDescription {
    if (render.status === 'rendered') {
        return {
            reason: render.visibility === 'hidden' ? render.hiddenBy : undefined,
            rendered: true,
            visibility: render.visibility
        };
    }

    return render.reason === 'unsupported'
        ? { reason: 'unsupported', rendered: false, visibility: 'notRendered' }
        : { reason: render.reason, rendered: false, visibility: render.visibility };
}
