import type {
    RuntimeIntrospectionLocator,
    RuntimeIntrospectionNode,
    RuntimeIntrospectionView,
    RuntimeNodeSequence
} from '../types/runtime-types.ts';
import { createNodeSequence } from './node-list.ts';

type LocatorTarget = {
    readonly selector: unknown;
    readonly view: RuntimeIntrospectionView;
};

function readLocatedNode(target: LocatorTarget): RuntimeIntrospectionNode | undefined {
    return target.view.find(target.selector);
}

function readLocatedNodes(target: LocatorTarget): readonly RuntimeIntrospectionNode[] {
    return Array.from(target.view.findAll(target.selector));
}

export function createIntrospectionLocator(
    view: RuntimeIntrospectionView,
    selector: unknown
): RuntimeIntrospectionLocator {
    const target = { selector, view };

    return Object.freeze({
        get exists() {
            return readLocatedNode(target) !== undefined;
        },
        get key() {
            return readLocatedNode(target)?.key;
        },
        get kind() {
            return readLocatedNode(target)?.kind;
        },
        get name() {
            return readLocatedNode(target)?.name;
        },
        get node() {
            return readLocatedNode(target);
        },
        get props() {
            return readLocatedNode(target)?.props;
        },
        get textContent() {
            return readLocatedNode(target)?.textContent;
        },
        get type() {
            return readLocatedNode(target)?.type;
        },
        callProp(property: PropertyKey, ...parameters: readonly unknown[]) {
            const node = readLocatedNode(target);

            if (node === undefined) {
                throw new TypeError('Cannot call a prop on a missing locator.');
            }

            return node.callProp(property, ...parameters);
        },
        omitProps(keys: readonly PropertyKey[]) {
            return readLocatedNode(target)?.omitProps(keys);
        },
        pickProps(keys: readonly PropertyKey[]) {
            return readLocatedNode(target)?.pickProps(keys);
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

export function createIntrospectionListLocator(
    view: RuntimeIntrospectionView,
    selector: unknown
): RuntimeNodeSequence {
    const target = { selector, view };

    return createNodeSequence(function readMatches() {
        return readLocatedNodes(target);
    }, {});
}
