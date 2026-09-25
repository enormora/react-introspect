import type { IntrospectionConsoleDiagnostics } from './introspect-diagnostics.ts';

type ConsoleDiagnosticRecorder = (message: unknown) => void;

export type NodeDiagnosticsChannel = {
    readonly subscribe: (name: string, record: ConsoleDiagnosticRecorder) => void;
};

const consoleDiagnosticChannels = Object.freeze([
    'console.error',
    'console.warn'
]);

export function createNodeConsoleDiagnostics(
    diagnosticsChannel: NodeDiagnosticsChannel
): IntrospectionConsoleDiagnostics {
    return Object.freeze({
        subscribe(record) {
            for (const channelName of consoleDiagnosticChannels) {
                diagnosticsChannel.subscribe(channelName, record);
            }
        }
    });
}
