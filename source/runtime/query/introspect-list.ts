import type {
    RuntimeIntrospectionList,
    RuntimeIntrospectionNode,
    RuntimeNodeSequence
} from '../types/introspect-runtime-types.ts';
import { nodeMatchesSelector, toSelector } from './introspect-selector.ts';

export function createNodeSequence<Members extends Record<string, unknown>>(
    readNodes: () => readonly RuntimeIntrospectionNode[],
    members: Members
): Members & RuntimeNodeSequence {
    return Object.freeze({
        ...members,
        get first() {
            return readNodes()[0];
        },
        get last() {
            return readNodes().at(-1);
        },
        get length() {
            return readNodes().length;
        },
        [Symbol.iterator]() {
            return readNodes()[Symbol.iterator]();
        },
        at(index: number) {
            return readNodes().at(index);
        }
    });
}

export function createIntrospectionList(nodes: readonly RuntimeIntrospectionNode[]): RuntimeIntrospectionList {
    const listNodes = Object.freeze(nodes.slice());

    return createNodeSequence(
        function readListNodes() {
            return listNodes;
        },
        {
            filterBy(selector: unknown) {
                const normalizedSelector = toSelector(selector);

                return createIntrospectionList(listNodes.filter(function isMatch(node) {
                    return nodeMatchesSelector(node, normalizedSelector);
                }));
            }
        }
    );
}
