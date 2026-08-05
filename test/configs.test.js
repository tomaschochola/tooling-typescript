/**
 * @file
 * @author Tomáš Chochola <tomaschochola@tomaschochola.cz>
 * @copyright © 2026 Tomáš Chochola <tomaschochola@tomaschochola.cz>
 *
 * @license CC-BY-ND-4.0
 *
 * @see {@link https://creativecommons.org/licenses/by-nd/4.0/} License
 * @see {@link https://github.com/tomaschochola} GitHub Profile
 * @see {@link https://github.com/sponsors/tomaschochola} GitHub Sponsors
 */

import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import typescript from 'typescript';

const repositoryRoot = resolve(import.meta.dirname, '..');

const configNames = [
  'base',
  'browser_playwright',
  'browser_webpack',
  'browser_webpack_babel',
  'browser_webpack_babel_react',
  'browser_webpack_react',
  'node',
  'node_webpack',
];

const transientOptionNames = new Set(['configFilePath', 'outDir', 'rootDir']);

const enabledBaseOptions = [
  'allowSyntheticDefaultImports',
  'alwaysStrict',
  'erasableSyntaxOnly',
  'esModuleInterop',
  'exactOptionalPropertyTypes',
  'forceConsistentCasingInFileNames',
  'isolatedModules',
  'noErrorTruncation',
  'noFallthroughCasesInSwitch',
  'noImplicitAny',
  'noImplicitOverride',
  'noImplicitReturns',
  'noImplicitThis',
  'noPropertyAccessFromIndexSignature',
  'noUncheckedIndexedAccess',
  'noUncheckedSideEffectImports',
  'noUnusedLocals',
  'noUnusedParameters',
  'resolveJsonModule',
  'resolvePackageJsonExports',
  'resolvePackageJsonImports',
  'strict',
  'strictBindCallApply',
  'strictBuiltinIteratorReturn',
  'strictFunctionTypes',
  'strictNullChecks',
  'strictPropertyInitialization',
  'useDefineForClassFields',
  'useUnknownInCatchVariables',
  'verbatimModuleSyntax',
];

const disabledBaseOptions = [
  'allowImportingTsExtensions',
  'allowJs',
  'allowUnreachableCode',
  'allowUnusedLabels',
  'declaration',
  'declarationMap',
  'libReplacement',
  'noCheck',
  'skipLibCheck',
];

const createProject = async (configName, source, extension = 'ts') => {
  const directory = await mkdtemp(join(repositoryRoot, '.test-'));
  const sourcePath = join(directory, `index.${extension}`);
  const configPath = join(directory, 'tsconfig.json');

  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  await writeFile(sourcePath, source);
  await writeFile(configPath, JSON.stringify({
    extends: resolve(repositoryRoot, `src/${configName}.json`),
    files: [`index.${extension}`],
    compilerOptions: {
      outDir: './dist',
      rootDir: '.',
    },
  }));

  const result = typescript.readConfigFile(configPath, typescript.sys.readFile);
  const parsed = typescript.parseJsonConfigFileContent(result.config, typescript.sys, directory, undefined, configPath);

  return {
    directory,
    parsed,
    sourcePath,
  };
};

const diagnosticCodes = (program) => typescript.getPreEmitDiagnostics(program).map(({ code }) => code);
const portableOptions = (options) => Object.fromEntries(Object.entries(options).filter(([name]) => !transientOptionNames.has(name)));

test('every source configuration resolves without configuration diagnostics', async (context) => {
  for (const configName of configNames) {
    const extension = configName.endsWith('_react') ? 'tsx' : 'ts';
    const project = await createProject(configName, 'export const answer = 42;\n', extension);

    context.after(() => rm(project.directory, {
      force: true,
      recursive: true,
    }));
    assert.deepEqual(project.parsed.errors, []);
    assert.equal(project.parsed.options.target, typescript.ScriptTarget.ES2025);
    assert.equal(project.parsed.options.moduleDetection, typescript.ModuleDetectionKind.Force);
    assert.equal(project.parsed.options.allowArbitraryExtensions, configName.includes('webpack') || configName === 'browser_playwright');

    for (const option of enabledBaseOptions) {
      assert.equal(project.parsed.options[option], true, `${configName} must enable ${option}`);
    }

    for (const option of disabledBaseOptions) {
      assert.equal(project.parsed.options[option], false, `${configName} must disable ${option}`);
    }
  }
});

test('browser, React, Playwright, Node.js, and bundler profiles remain distinct', async (context) => {
  const projects = new Map();

  for (const configName of configNames.filter((name) => name !== 'base')) {
    const extension = configName.endsWith('_react') ? 'tsx' : 'ts';
    const project = await createProject(configName, 'export const answer = 42;\n', extension);

    projects.set(configName, project);
    context.after(() => rm(project.directory, {
      force: true,
      recursive: true,
    }));
  }

  const browser = projects.get('browser_webpack').parsed.options;
  const babel = projects.get('browser_webpack_babel').parsed.options;
  const react = projects.get('browser_webpack_react').parsed.options;
  const babelReact = projects.get('browser_webpack_babel_react').parsed.options;
  const playwright = projects.get('browser_playwright').parsed.options;
  const node = projects.get('node').parsed.options;
  const nodeWebpack = projects.get('node_webpack').parsed.options;

  assert.deepEqual(browser.lib, ['lib.dom.d.ts', 'lib.es2025.d.ts']);
  assert.equal(browser.module, typescript.ModuleKind.Preserve);
  assert.equal(browser.moduleResolution, typescript.ModuleResolutionKind.Bundler);
  assert.equal(browser.allowArbitraryExtensions, true);
  assert.equal(browser.noEmit, true);
  assert.deepEqual(browser.types, []);
  assert.deepEqual(portableOptions(babel), portableOptions(browser));
  assert.equal(react.jsx, typescript.JsxEmit.ReactJSX);
  assert.equal(babelReact.jsx, typescript.JsxEmit.ReactJSX);
  assert.deepEqual(playwright.types, ['node', '@playwright/test']);
  assert.equal(playwright.allowArbitraryExtensions, true);
  assert.equal(node.module, typescript.ModuleKind.NodeNext);
  assert.equal(node.moduleResolution, typescript.ModuleResolutionKind.NodeNext);
  assert.equal(node.allowArbitraryExtensions, false);
  assert.equal(node.noEmit, false);
  assert.equal(node.sourceMap, true);
  assert.deepEqual(node.types, ['node']);
  assert.equal(nodeWebpack.moduleResolution, typescript.ModuleResolutionKind.Bundler);
  assert.equal(nodeWebpack.allowArbitraryExtensions, true);
  assert.equal(nodeWebpack.noEmit, true);
  assert.deepEqual(nodeWebpack.types, ['node']);
});

test('strict and erasable-only policies reject unsupported source', async (context) => {
  const project = await createProject('base', 'export function identity(value) { return value; }\nexport enum Mode { Active }\n');

  const program = typescript.createProgram({
    options: project.parsed.options,
    rootNames: project.parsed.fileNames,
  });

  context.after(() => rm(project.directory, {
    force: true,
    recursive: true,
  }));
  assert.deepEqual(diagnosticCodes(program), [7006, 1294]);
});

test('Node.js profile emits JavaScript and source maps', async (context) => {
  const project = await createProject('node', 'export const processId: number = process.pid;\n');

  const program = typescript.createProgram({
    options: project.parsed.options,
    rootNames: project.parsed.fileNames,
  });

  const diagnostics = typescript.getPreEmitDiagnostics(program);
  const result = program.emit();

  context.after(() => rm(project.directory, {
    force: true,
    recursive: true,
  }));
  assert.deepEqual(diagnostics, []);
  assert.equal(result.emitSkipped, false);
  await access(join(project.directory, 'dist/index.js'));
  await access(join(project.directory, 'dist/index.js.map'));
});

test('browser Webpack profile type-checks DOM source without emitting output', async (context) => {
  const project = await createProject('browser_webpack', 'document.title = "test";\nexport const answer = 42;\n');

  const program = typescript.createProgram({
    options: project.parsed.options,
    rootNames: project.parsed.fileNames,
  });

  const diagnostics = typescript.getPreEmitDiagnostics(program);
  const result = program.emit();

  context.after(() => rm(project.directory, {
    force: true,
    recursive: true,
  }));
  assert.deepEqual(diagnostics, []);
  assert.equal(result.emitSkipped, false);
  await assert.rejects(access(join(project.directory, 'dist/index.js')));
});

test('copy templates reference existing public profiles and minimal project inputs', async () => {
  for (const configName of configNames.filter((name) => name !== 'base')) {
    const templatePath = resolve(repositoryRoot, `templates/${configName}.json`);
    const template = JSON.parse(await readFile(templatePath));
    const profileName = template.extends.replace('@tomaschochola/tooling-typescript/src/', '');

    assert.equal(profileName, `${configName}.json`);
    await access(resolve(repositoryRoot, 'src', profileName));
    assert.equal(dirname(templatePath), resolve(repositoryRoot, 'templates'));
  }

  const playwright = JSON.parse(await readFile(resolve(repositoryRoot, 'templates/browser_playwright.json')));

  assert.deepEqual(playwright.include, ['./tests/**/*']);
});
