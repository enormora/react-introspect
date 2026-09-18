import type { RuntimeProbeList, RuntimeProbeNode } from './probe-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './probe-selector.ts';

export function createProbeList(nodes: readonly RuntimeProbeNode[]): RuntimeProbeList {
    const listNodes = Object.freeze(nodes.slice());

    return Object.freeze({
        get first() {
            return listNodes[0];
        },
        get last() {
            return listNodes.at(-1);
        },
        get length() {
            return listNodes.length;
        },
        [Symbol.iterator]() {
            return listNodes[Symbol.iterator]();
        },
        at(index: number) {
            return listNodes.at(index);
        },
        filterBy(selector: unknown) {
            const normalizedSelector = toSelector(selector);

            return createProbeList(listNodes.filter(function isMatch(node) {
                return nodeMatchesSelector(node, normalizedSelector);
            }));
        }
    });
}
