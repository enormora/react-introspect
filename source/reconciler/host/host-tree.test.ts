import { suite, test } from '@overkill-dev/test';
import type { IntrospectionSnapshot } from '../../snapshot/model/snapshot-contract.ts';
import { createIntrospectionReconcilerRuntime } from '../root/reconciler-runtime.ts';
import {
    createHostContainer,
    createIntrospectionHostConfig,
    type IntrospectionHostConfig,
    type IntrospectionHostContainer
} from './host-tree.ts';

type HostInstance = ReturnType<IntrospectionHostConfig['createInstance']>;

type TextInstance = ReturnType<IntrospectionHostConfig['createTextInstance']>;

type PublishingContainer = {
    readonly container: IntrospectionHostContainer;
    readonly commit: () => IntrospectionSnapshot;
};

const hostConfig = createIntrospectionHostConfig(createIntrospectionReconcilerRuntime());

function requireValue<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected value to exist.');
    }

    return value;
}

function createContainer(): PublishingContainer {
    const published: IntrospectionSnapshot[] = [];
    const container = createHostContainer(
        {
            captureSnapshotError(cause) {
                throw cause;
            },
            publish(snapshot) {
                published.push(snapshot);
            },
            readNextRenderCount() {
                return 1;
            }
        },
        { generator: undefined, prefix: 'test-' },
        undefined
    );

    return {
        commit() {
            hostConfig.resetAfterCommit(container);

            return requireValue(published.at(-1));
        },
        container
    };
}

type RecordingContainer = {
    readonly container: IntrospectionHostContainer;
    readonly capturedErrors: readonly unknown[];
    readonly published: readonly IntrospectionSnapshot[];
};

function createRecordingContainer(generator: (generatedId: string) => string): RecordingContainer {
    const capturedErrors: unknown[] = [];
    const published: IntrospectionSnapshot[] = [];
    const container = createHostContainer(
        {
            captureSnapshotError(cause) {
                capturedErrors.push(cause);
            },
            publish(snapshot) {
                published.push(snapshot);
            },
            readNextRenderCount() {
                return 1;
            }
        },
        { generator, prefix: 'test-' },
        undefined
    );

    return { capturedErrors, container, published };
}

function readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function commitButtonWithProps(host: RecordingContainer, props: Readonly<Record<PropertyKey, unknown>>): void {
    const button = hostConfig.createInstance('button', props, host.container, { refs: undefined });

    hostConfig.appendChildToContainer(host.container, button);
    hostConfig.resetAfterCommit(host.container);
}

function createInstance(
    host: PublishingContainer,
    type: string,
    props: Readonly<Record<PropertyKey, unknown>>
): HostInstance {
    return hostConfig.createInstance(type, props, host.container, { refs: undefined });
}

function createText(host: PublishingContainer, text: string): TextInstance {
    return hostConfig.createTextInstance(text, host.container, { refs: undefined });
}

function createButtonSnapshot(): IntrospectionSnapshot {
    const host = createContainer();
    const button = createInstance(host, 'button', { children: 'ignored', title: 'Save' });
    const text = createText(host, 'Save');

    hostConfig.appendInitialChild(button, text);
    hostConfig.appendChildToContainer(host.container, button);

    return host.commit();
}

export const testNode = suite('introspection host tree', [
    test('hands a usage error from building the snapshot to the container instead of publishing', function (scope) {
        const host = createRecordingContainer(String);
        const portal = { $$typeof: Symbol.for('react.portal'), children: null, containerInfo: {}, key: null };

        commitButtonWithProps(host, { slot: portal });

        scope.assert.deepEqual(
            { captured: host.capturedErrors.map(readErrorMessage), published: host.published.length },
            { captured: [ 'React Introspect cannot represent portal output yet.' ], published: 0 }
        );

        return scope.assert.collect();
    }),
    test('hands other errors from building the snapshot to the container instead of throwing', function (scope) {
        const host = createRecordingContainer(function failToGenerate() {
            throw new Error('generator failed');
        });

        commitButtonWithProps(host, { id: '_test-r_a_' });

        scope.assert.deepEqual(
            { captured: host.capturedErrors.map(readErrorMessage), published: host.published.length },
            { captured: [ 'generator failed' ], published: 0 }
        );

        return scope.assert.collect();
    }),
    test('publishes host children as snapshot nodes', function (scope) {
        const snapshot = createButtonSnapshot();
        const root = requireValue(snapshot.root);

        scope.assert.equal(snapshot.renderCount, 1);
        scope.assert.equal(root.name, 'button');
        scope.assert.deepEqual(root.props, { title: 'Save' });
        scope.assert.equal(root.textContent, 'Save');

        return scope.assert.collect();
    }),
    test('maintains parent child order', function (scope) {
        const host = createContainer();
        const first = createInstance(host, 'span', { title: 'first' });
        const second = createInstance(host, 'strong', { title: 'second' });

        hostConfig.appendChildToContainer(host.container, second);
        hostConfig.insertInContainerBefore(host.container, first, second);

        const root = requireValue(host.commit().root);

        scope.assert.deepEqual(
            root.renderedChildren.map(function readName(node) {
                return node.name;
            }),
            [ 'span', 'strong' ]
        );

        return scope.assert.collect();
    }),
    test('detaches moved children from their previous parent', function (scope) {
        const host = createContainer();
        const firstParent = createInstance(host, 'section', {});
        const secondParent = createInstance(host, 'article', {});
        const child = createText(host, 'moved');

        hostConfig.appendChild(firstParent, child);
        hostConfig.appendChild(secondParent, child);

        scope.assert.equal(firstParent.readChildren().length, 0);
        scope.assert.equal(secondParent.readChildren()[0], child);

        return scope.assert.collect();
    }),
    test('updates text visibility in snapshots', function (scope) {
        const host = createContainer();
        const text = createText(host, 'status');

        hostConfig.hideTextInstance(text);
        hostConfig.appendChildToContainer(host.container, text);

        scope.assert.deepEqual(requireValue(host.commit().root).render, {
            hiddenBy: 'suspended',
            status: 'rendered',
            visibility: 'hidden'
        });

        hostConfig.unhideTextInstance(text, 'status');

        scope.assert.deepEqual(requireValue(host.commit().root).render, { status: 'rendered', visibility: 'visible' });

        return scope.assert.collect();
    }),
    test('exposes a text instance as its own public instance', function (scope) {
        const text = createText(createContainer(), 'label');

        scope.assert.equal(hostConfig.getPublicInstance(text), text);

        return scope.assert.collect();
    }),
    test('removes children from parents', function (scope) {
        const host = createContainer();
        const text = createText(host, 'removed');

        hostConfig.appendChildToContainer(host.container, text);
        hostConfig.removeChildFromContainer(host.container, text);

        const root = requireValue(host.commit().root);

        scope.assert.equal(root.name, 'Fragment');
        scope.assert.equal(root.renderedChildren.length, 0);

        return scope.assert.collect();
    })
]);
