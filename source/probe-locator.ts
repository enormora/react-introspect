import type {
    RuntimeProbeListLocator,
    RuntimeProbeLocator,
    RuntimeProbeNode,
    RuntimeProbeView
} from './probe-runtime-types.ts';
import type { SnapshotProps } from './probe-snapshot.ts';

type LocatorTarget = {
    readonly selector: unknown;
    readonly view: RuntimeProbeView;
};

function readProperty(value: SnapshotProps, property: PropertyKey): unknown {
    return value[property];
}

function callProp(props: SnapshotProps, property: PropertyKey, parameters: readonly unknown[]): unknown {
    const value = readProperty(props, property);

    if (typeof value !== 'function') {
        throw new TypeError(`Prop ${String(property)} is not callable.`);
    }

    return Reflect.apply(value, undefined, parameters);
}

function readLocatedNode(target: LocatorTarget): RuntimeProbeNode | undefined {
    return target.view.find(target.selector);
}

function readLocatedNodes(target: LocatorTarget): readonly RuntimeProbeNode[] {
    return Array.from(target.view.findAll(target.selector));
}

export function createProbeLocator(view: RuntimeProbeView, selector: unknown): RuntimeProbeLocator {
    const target = { selector, view };

    return Object.freeze({
        get exists() {
            return readLocatedNode(target) !== undefined;
        },
        get node() {
            return readLocatedNode(target);
        },
        callProp(property: PropertyKey, ...parameters: readonly unknown[]) {
            const node = readLocatedNode(target);

            if (node === undefined) {
                throw new TypeError('Cannot call a prop on a missing locator.');
            }

            return callProp(node.props, property, parameters);
        },
        sendEvent(name: string, ...parameters: readonly unknown[]) {
            const node = readLocatedNode(target);

            if (node === undefined) {
                throw new TypeError('Cannot send an event to a missing locator.');
            }

            return node.sendEvent(name, ...parameters);
        }
    });
}

export function createProbeListLocator(view: RuntimeProbeView, selector: unknown): RuntimeProbeListLocator {
    const target = { selector, view };

    return Object.freeze({
        get first() {
            return readLocatedNodes(target)[0];
        },
        get last() {
            return readLocatedNodes(target).at(-1);
        },
        get length() {
            return readLocatedNodes(target).length;
        },
        [Symbol.iterator]() {
            return readLocatedNodes(target)[Symbol.iterator]();
        },
        at(index: number) {
            return readLocatedNodes(target).at(index);
        }
    });
}
