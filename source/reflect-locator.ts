import type {
    RuntimeReflectListLocator,
    RuntimeReflectLocator,
    RuntimeReflectNode,
    RuntimeReflectView
} from './reflect-runtime-types.ts';

type LocatorTarget = {
    readonly selector: unknown;
    readonly view: RuntimeReflectView;
};

function readLocatedNode(target: LocatorTarget): RuntimeReflectNode | undefined {
    return target.view.find(target.selector);
}

function readLocatedNodes(target: LocatorTarget): readonly RuntimeReflectNode[] {
    return Array.from(target.view.findAll(target.selector));
}

export function createReflectLocator(view: RuntimeReflectView, selector: unknown): RuntimeReflectLocator {
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

            return node.callProp(property, ...parameters);
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

export function createReflectListLocator(view: RuntimeReflectView, selector: unknown): RuntimeReflectListLocator {
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
