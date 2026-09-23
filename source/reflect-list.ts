import type { RuntimeReflectList, RuntimeReflectNode } from './reflect-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './reflect-selector.ts';

export function createReflectList(nodes: readonly RuntimeReflectNode[]): RuntimeReflectList {
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

            return createReflectList(listNodes.filter(function isMatch(node) {
                return nodeMatchesSelector(node, normalizedSelector);
            }));
        }
    });
}
