import type { IntrospectionConsoleDiagnostics } from './render-diagnostics.ts';

type ConsoleDiagnosticRecorder = (message: unknown) => void;

export type NodeDiagnosticsChannel = {
    readonly subscribe: (name: string, record: ConsoleDiagnosticRecorder) => void;
};

const consoleDiagnosticChannels = [
    'console.error',
    'console.warn'
];

export function createNodeConsoleDiagnostics(
    diagnosticsChannel: NodeDiagnosticsChannel
): IntrospectionConsoleDiagnostics {
    return {
        subscribe(record) {
            for (const channelName of consoleDiagnosticChannels) {
                diagnosticsChannel.subscribe(channelName, record);
            }
        }
    };
}
