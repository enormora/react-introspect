import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { suite, test } from '@overkill-dev/test';

type EqualScope = {
    readonly assert: {
        readonly equal: (actual: unknown, expected: unknown) => void;
    };
};

type PackageManifest = {
    readonly bugs: {
        readonly url: string;
    };
    readonly exports: {
        readonly '.': {
            readonly import: string;
            readonly types: string;
        };
    };
    readonly homepage: string;
    readonly name: string;
    readonly type: string;
};

type PackageExports = {
    readonly createFakeRefNode: () => unknown;
    readonly matchRefs: () => unknown;
    readonly introspect: (element: unknown) => SmokeView;
};

type ReactModule = {
    readonly createElement: (type: string, props: null, ...children: readonly string[]) => unknown;
};

type SmokeView = {
    readonly find: (selector: string) => { readonly textContent: string; } | undefined;
};

const sourceFolder = path.dirname(fileURLToPath(import.meta.url));
const projectFolder = path.join(sourceFolder, '../../..');
const packageFolder = path.join(projectFolder, 'target/package-smoke');
const consumerFolder = path.join(projectFolder, 'target/package-smoke-consumer');
const jsonIndentation = 4;
const consumerPackageJson = {
    name: 'react-introspect-smoke-consumer',
    private: true,
    type: 'module'
};

async function runProjectCommand(command: string, parameters: readonly string[]): Promise<void> {
    await new Promise<void>(function waitForCommand(resolve, reject) {
        const childProcess = spawn(command, parameters, {
            cwd: projectFolder,
            stdio: 'inherit'
        });

        childProcess.once('error', reject);
        childProcess.once('close', function resolveCommand(exitCode) {
            if (exitCode === 0) {
                resolve(undefined);

                return;
            }

            reject(new Error(`Command failed: ${command} ${parameters.join(' ')}`));
        });
    });
}

async function requirePackagedFile(relativePath: string): Promise<void> {
    await fs.access(path.join(packageFolder, relativePath));
}

async function readPackageManifest(): Promise<PackageManifest> {
    return JSON.parse(await fs.readFile(path.join(packageFolder, 'package.json'), 'utf8')) as PackageManifest;
}

async function assertManifest(scope: EqualScope): Promise<void> {
    const manifest = await readPackageManifest();

    scope.assert.equal(manifest.name, 'react-introspect');
    scope.assert.equal(manifest.type, 'module');
    scope.assert.equal(manifest.bugs.url, 'https://github.com/enormora/react-introspect/issues');
    scope.assert.equal(manifest.homepage, 'https://github.com/enormora/react-introspect#readme');
    scope.assert.equal(manifest.exports['.'].import, './react-introspect.entry-point.js');
    scope.assert.equal(manifest.exports['.'].types, './react-introspect.entry-point.d.ts');
}

async function assertRuntimeImport(scope: EqualScope): Promise<void> {
    const packageExports = await import(
        pathToFileURL(path.join(packageFolder, 'react-introspect.entry-point.js')).href
    ) as PackageExports;
    const React = await import('react') as ReactModule;

    scope.assert.equal(typeof packageExports.createFakeRefNode, 'function');
    scope.assert.equal(typeof packageExports.matchRefs, 'function');
    scope.assert.equal(typeof packageExports.introspect, 'function');

    const view = packageExports.introspect(React.createElement('main', null, 'Smoke'));

    scope.assert.equal(view.find('main')?.textContent, 'Smoke');
}

async function writeConsumerProject(): Promise<void> {
    const nodeModulesFolder = path.join(consumerFolder, 'node_modules');
    const packageLink = path.join(nodeModulesFolder, 'react-introspect');

    await fs.rm(consumerFolder, { force: true, recursive: true });
    await fs.mkdir(nodeModulesFolder, { recursive: true });
    await fs.symlink(path.relative(nodeModulesFolder, packageFolder), packageLink, 'dir');
    await fs.writeFile(
        path.join(consumerFolder, 'package.json'),
        `${JSON.stringify(consumerPackageJson, null, jsonIndentation)}\n`
    );
    await fs.writeFile(
        path.join(consumerFolder, 'tsconfig.json'),
        `${
            JSON.stringify(
                {
                    compilerOptions: {
                        module: 'NodeNext',
                        moduleResolution: 'NodeNext',
                        strict: true,
                        target: 'ES2025',
                        types: []
                    },
                    files: [ 'smoke.ts' ]
                },
                null,
                jsonIndentation
            )
        }\n`
    );
    await fs.writeFile(
        path.join(consumerFolder, 'smoke.ts'),
        [
            "import React from 'react';",
            "import { createFakeRefNode, matchRefs, introspect } from 'react-introspect';",
            "import type { IntrospectionView } from 'react-introspect';",
            '',
            'function Button(props: { readonly label: string; readonly onSave: () => void; }): React.ReactNode {',
            "    return React.createElement('button', { onClick: props.onSave }, props.label);",
            '}',
            '',
            'const view: IntrospectionView = introspect(',
            "    React.createElement(Button, { label: 'Save', onSave() {} }),",
            '    { depth: 2 }',
            ');',
            'const button = view.find(Button);',
            "button?.pickProps([ 'label' ]);",
            "view.find('button')?.sendEvent('click');",
            'createFakeRefNode({ focus() {} });',
            "matchRefs([{ type: 'input', node: {} }]);",
            ''
        ]
            .join('\n')
    );
}

async function packPackage(): Promise<void> {
    await fs.rm(packageFolder, { force: true, recursive: true });

    await runProjectCommand('packtory', [
        'pack',
        'react-introspect',
        '--format',
        'folder',
        '--out',
        packageFolder,
        '--version',
        '0.0.0-smoke'
    ]);
}

async function assertPackagedFiles(scope: EqualScope): Promise<void> {
    await requirePackagedFile('LICENSE');
    await requirePackagedFile('banner.svg');
    await requirePackagedFile('logo.svg');
    await requirePackagedFile('readme.md');
    await assertManifest(scope);
    await assertRuntimeImport(scope);
}

async function assertConsumerTypes(): Promise<void> {
    await writeConsumerProject();

    await runProjectCommand('tsc', [
        '--project',
        path.join(consumerFolder, 'tsconfig.json'),
        '--noEmit'
    ]);
}

export const testNode = suite('package smoke', [
    test('packs and imports the published package shape', async function verifyPackagedArtifact(scope) {
        await packPackage();
        await assertPackagedFiles(scope);
        await assertConsumerTypes();

        return scope.assert.collect();
    })
]);
