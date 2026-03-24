import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import { detectSrcDir, validateScenarioId } from '../config';
import type { PreflightConfig } from '../config';

// Handle @babel/traverse CJS/ESM interop
const traverseModule = require('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

interface TestStep {
  tap?: string;
  see?: string | { id: string; text?: string };
  notSee?: string;
  type?: [string, string];
  wait?: number;
  scroll?: [string, string];
  swipe?: [string, number?];
  back?: true;
  hideKeyboard?: true;
  longPress?: string;
  raw?: string;
}

interface ScannedScenario {
  id: string;
  filePath: string;
  steps: TestStep[];
  env?: Record<string, string>;
}

interface ScannedVariant {
  key: string;
  steps: TestStep[];
}

interface ScannedFlowStep {
  screen: string;
  steps: TestStep[];
  skipIf?: string;
}

interface ScannedScenarioWithVariants extends ScannedScenario {
  variants: ScannedVariant[];
  flow: ScannedFlowStep[];
  env: Record<string, string>;
}

function extractTestSteps(testFnNode: any): TestStep[] {
  const steps: TestStep[] = [];

  // Get the array expression from the function body
  let arrayNode: any = null;
  if (testFnNode.type === 'ArrowFunctionExpression' && testFnNode.body.type === 'ArrayExpression') {
    arrayNode = testFnNode.body;
  } else if (testFnNode.body?.type === 'BlockStatement') {
    // Look for a return statement with an array
    for (const stmt of testFnNode.body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ArrayExpression') {
        arrayNode = stmt.argument;
        break;
      }
    }
  }

  if (!arrayNode) return steps;

  for (const element of arrayNode.elements) {
    if (!element || element.type !== 'CallExpression') continue;
    const callee = element.callee;
    if (!callee || callee.type !== 'Identifier') continue;

    const name = callee.name;
    const args = element.arguments;

    try {
      switch (name) {
        case 'tap':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ tap: args[0].value });
          }
          break;
        case 'see':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ see: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            const obj: { id?: string; text?: string } = {};
            for (const prop of args[0].properties) {
              if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier' && prop.value.type === 'StringLiteral') {
                if (prop.key.name === 'id') obj.id = prop.value.value;
                if (prop.key.name === 'text') obj.text = prop.value.value;
              }
            }
            if (obj.id) steps.push({ see: obj as { id: string; text?: string } });
          }
          break;
        case 'notSee':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ notSee: args[0].value });
          }
          break;
        case 'type':
          if (args[0]?.type === 'StringLiteral' && args[1]?.type === 'StringLiteral') {
            steps.push({ type: [args[0].value, args[1].value] });
          }
          break;
        case 'wait':
          if (args[0]?.type === 'NumericLiteral') {
            steps.push({ wait: args[0].value });
          }
          break;
        case 'scroll':
          if (args[0]?.type === 'StringLiteral' && args[1]?.type === 'StringLiteral') {
            steps.push({ scroll: [args[0].value, args[1].value] });
          }
          break;
        case 'swipe':
          if (args[0]?.type === 'StringLiteral') {
            const duration = args[1]?.type === 'NumericLiteral' ? args[1].value : undefined;
            steps.push({ swipe: [args[0].value, duration] });
          }
          break;
        case 'back':
          steps.push({ back: true });
          break;
        case 'hideKeyboard':
          steps.push({ hideKeyboard: true });
          break;
        case 'longPress':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ longPress: args[0].value });
          }
          break;
        case 'raw':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ raw: args[0].value });
          }
          break;
      }
    } catch {
      // Skip malformed steps
    }
  }

  return steps;
}


function resolveImportedFunction(identifierName: string, ast: any, filePath: string): any | null {
  // Find the import declaration for this identifier
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const specifier = node.specifiers.find(
      (s: any) =>
        (s.type === 'ImportSpecifier' || s.type === 'ImportDefaultSpecifier') &&
        s.local.name === identifierName,
    );
    if (!specifier) continue;

    const importedName = specifier.type === 'ImportDefaultSpecifier'
      ? 'default'
      : (specifier.imported?.name ?? identifierName);
    const importSource: string = node.source.value;

    // Resolve relative path from the file containing the import
    const dir = path.dirname(filePath);
    const candidates = [
      importSource,
      importSource + '.ts',
      importSource + '.tsx',
      importSource + '.js',
      importSource + '/index.ts',
      importSource + '/index.tsx',
      importSource + '/index.js',
    ];

    let resolvedPath: string | null = null;
    for (const candidate of candidates) {
      const full = path.resolve(dir, candidate);
      if (fs.existsSync(full)) {
        resolvedPath = full;
        break;
      }
    }

    if (!resolvedPath) return null;

    try {
      const importedSource = fs.readFileSync(resolvedPath, 'utf-8');
      const importedAst = parse(importedSource, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      // Find the exported function
      for (const stmt of importedAst.program.body) {
        // export const foo = (...) => [...]
        if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration') {
          for (const decl of stmt.declaration.declarations) {
            if (decl.id?.type === 'Identifier' && decl.id.name === importedName && decl.init) {
              return decl.init;
            }
          }
        }
        // export function foo(...) { ... }
        if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'FunctionDeclaration') {
          if (stmt.declaration.id?.name === importedName) {
            return stmt.declaration;
          }
        }
        // export default ...
        if (importedName === 'default' && stmt.type === 'ExportDefaultDeclaration') {
          return stmt.declaration;
        }
      }
    } catch {
      // Failed to parse imported file
    }

    return null;
  }
  return null;
}

function extractTestFromProp(obj: any, ast?: any, filePath?: string): TestStep[] {
  const testProp = obj.properties.find(
    (p: any) =>
      (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
      p.key.type === 'Identifier' &&
      p.key.name === 'test',
  );
  if (testProp) {
    const fnNode = testProp.type === 'ObjectMethod' ? testProp : testProp.value;
    // If test is a reference to an imported function, resolve it
    if (fnNode.type === 'Identifier' && ast && filePath) {
      const resolved = resolveImportedFunction(fnNode.name, ast, filePath);
      if (resolved) return extractTestSteps(resolved);
      return [];
    }
    return extractTestSteps(fnNode);
  }
  return [];
}

function extractVariants(firstArg: any, ast?: any, filePath?: string): ScannedVariant[] {
  const variantsProp = firstArg.properties.find(
    (p: any) =>
      p.type === 'ObjectProperty' &&
      p.key.type === 'Identifier' &&
      p.key.name === 'variants' &&
      p.value.type === 'ObjectExpression',
  );

  if (!variantsProp || variantsProp.value.type !== 'ObjectExpression') return [];

  const variants: ScannedVariant[] = [];
  for (const prop of variantsProp.value.properties) {
    if (prop.type !== 'ObjectProperty') continue;

    let key: string | undefined;
    if (prop.key.type === 'Identifier') key = prop.key.name;
    else if (prop.key.type === 'StringLiteral') key = prop.key.value;
    if (!key) continue;

    if (!validateScenarioId(key)) {
      console.warn(`[preflight] Warning: variant key "${key}" is invalid, skipping`);
      continue;
    }

    if (prop.value.type !== 'ObjectExpression') continue;

    const steps = extractTestFromProp(prop.value, ast, filePath);
    variants.push({ key, steps });
  }

  return variants;
}

function extractFlow(firstArg: any): ScannedFlowStep[] {
  const flowProp = firstArg.properties.find(
    (p: any) =>
      p.type === 'ObjectProperty' &&
      p.key.type === 'Identifier' &&
      p.key.name === 'flow' &&
      p.value.type === 'ArrayExpression',
  );

  if (!flowProp || flowProp.value.type !== 'ArrayExpression') return [];

  const flowSteps: ScannedFlowStep[] = [];
  for (const element of flowProp.value.elements) {
    if (!element || element.type !== 'ObjectExpression') continue;

    const screenProp = element.properties.find(
      (p: any) =>
        p.type === 'ObjectProperty' &&
        p.key.type === 'Identifier' &&
        p.key.name === 'screen' &&
        p.value.type === 'StringLiteral',
    );
    if (!screenProp || screenProp.value.type !== 'StringLiteral') continue;

    // Flow steps use "actions" instead of "test"
    const actionsProp = element.properties.find(
      (p: any) =>
        (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
        p.key.type === 'Identifier' &&
        p.key.name === 'actions',
    );
    let steps: TestStep[] = [];
    if (actionsProp) {
      const fnNode = actionsProp.type === 'ObjectMethod' ? actionsProp : actionsProp.value;
      steps = extractTestSteps(fnNode);
    }
    // Parse skipIf
    const skipIfProp = element.properties.find(
      (p: any) =>
        p.type === 'ObjectProperty' &&
        p.key.type === 'Identifier' &&
        p.key.name === 'skipIf' &&
        p.value.type === 'StringLiteral',
    );
    const skipIf = skipIfProp?.value?.type === 'StringLiteral' ? skipIfProp.value.value : undefined;

    flowSteps.push({ screen: screenProp.value.value, steps, skipIf });
  }

  return flowSteps;
}

export function scanScenarios(source: string, filePath: string): ScannedScenarioWithVariants[] {
  const results: ScannedScenarioWithVariants[] = [];

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  traverse(ast, {
    CallExpression(nodePath: any) {
      const callee = nodePath.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'scenario') return;

      const firstArg = nodePath.node.arguments[0];
      if (!firstArg || firstArg.type !== 'ObjectExpression') return;

      const idProp = firstArg.properties.find(
        (p: any) =>
          p.type === 'ObjectProperty' &&
          p.key.type === 'Identifier' &&
          p.key.name === 'id' &&
          p.value.type === 'StringLiteral',
      );

      if (!idProp || idProp.type !== 'ObjectProperty' || idProp.value.type !== 'StringLiteral') return;

      const id = idProp.value.value;

      if (!validateScenarioId(id)) {
        console.warn(`[preflight] Warning: scenario id "${id}" in ${filePath} is invalid, skipping`);
        return;
      }

      const steps = extractTestFromProp(firstArg, ast, filePath);
      const variants = extractVariants(firstArg, ast, filePath);
      const flow = extractFlow(firstArg);

      // Parse env: { KEY: 'value' }
      const env: Record<string, string> = {};
      const envProp = firstArg.properties.find(
        (p: any) =>
          p.type === 'ObjectProperty' &&
          p.key.type === 'Identifier' &&
          p.key.name === 'env' &&
          p.value.type === 'ObjectExpression',
      );
      if (envProp && envProp.value.type === 'ObjectExpression') {
        for (const prop of envProp.value.properties) {
          if (
            prop.type === 'ObjectProperty' &&
            (prop.key.type === 'Identifier' || prop.key.type === 'StringLiteral') &&
            prop.value.type === 'StringLiteral'
          ) {
            const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
            env[key] = prop.value.value;
          }
        }
      }

      results.push({ id, filePath, steps, variants, flow, env });
    },
  });

  return results;
}

type AppId = string | { ios: string; android: string };

function formatAppId(appId: AppId): string[] {
  if (typeof appId === 'string') {
    return [`appId: ${escapeYamlString(appId)}`];
  }
  return [`appId: \${APP_ID}`];
}

function escapeYamlString(value: string): string {
  if (/["\n\r:\\#{}[\],&*?|>!%@`]/.test(value)) {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return '"' + value + '"';
}

const MAESTRO_COMMANDS = new Set([
  'launchApp', 'stopApp', 'clearState', 'clearKeychain',
  'tapOn', 'doubleTapOn', 'longPressOn', 'swipe', 'scroll',
  'scrollUntilVisible', 'inputText', 'eraseText', 'pressKey',
  'openLink', 'navigate', 'assertVisible', 'assertNotVisible',
  'assertTrue', 'assertWithAI', 'takeScreenshot', 'setLocation',
  'repeat', 'runFlow', 'runScript', 'waitForAnimationToEnd',
  'extendedWaitUntil', 'evalScript', 'back', 'hideKeyboard',
  'copyTextFrom', 'pasteText', 'addMedia', 'startRecording',
  'stopRecording',
]);

function validateYaml(yaml: string, scenarioId: string): void {
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match top-level commands: "- commandName:" or "- commandName"
    const match = line.match(/^- (\w+)(?::|\s*$)/);
    if (match) {
      const cmd = match[1]!;
      if (!MAESTRO_COMMANDS.has(cmd)) {
        console.warn(`[preflight] Warning: unknown Maestro command "${cmd}" in ${scenarioId}.yaml (line ${i + 1})`);
      }
    }
  }
}

function stepToYaml(step: TestStep): string {
  if (step.tap) {
    return `- tapOn:\n    id: ${escapeYamlString(step.tap)}`;
  }
  if (step.see !== undefined) {
    if (typeof step.see === 'string') {
      return `- assertVisible:\n    text: ${escapeYamlString(step.see)}`;
    }
    const lines = [`- assertVisible:`];
    if (step.see.id) lines.push(`    id: ${escapeYamlString(step.see.id)}`);
    if (step.see.text) lines.push(`    text: ${escapeYamlString(step.see.text)}`);
    return lines.join('\n');
  }
  if (step.notSee) {
    return `- assertNotVisible:\n    text: ${escapeYamlString(step.notSee)}`;
  }
  if (step.type) {
    return `- tapOn:\n    id: ${escapeYamlString(step.type[0])}\n- inputText: ${escapeYamlString(step.type[1])}`;
  }
  if (step.wait) {
    const clamped = Math.max(0, Math.min(60000, step.wait));
    return `- runScript:\n    script: |\n      java.lang.Thread.sleep(${clamped})`;
  }
  if (step.scroll) {
    return `- scrollUntilVisible:\n    element:\n      id: ${escapeYamlString(step.scroll[0])}\n    direction: ${step.scroll[1]!.toUpperCase()}`;
  }
  if (step.swipe) {
    const duration = step.swipe[1] ?? 400;
    return `- swipe:\n    direction: ${step.swipe[0]!.toUpperCase()}\n    duration: ${duration}`;
  }
  if (step.back) {
    return `- back`;
  }
  if (step.hideKeyboard) {
    return `- hideKeyboard`;
  }
  if (step.longPress) {
    return `- longPressOn:\n    id: ${escapeYamlString(step.longPress)}`;
  }
  if (step.raw) {
    return step.raw;
  }
  return '';
}

export function generateYaml(scenario: ScannedScenario, appId: AppId, snapshotsDir: string = '.maestro/snapshots', env?: Record<string, string>): string {
  // For variants, the assertVisible uses the base ID (the testID on the wrapper View)
  const baseId = scenario.id.includes('/') ? scenario.id.split('/')[0]! : scenario.id;

  const lines = [
    ...formatAppId(appId),
    `tags:`,
    `  - preflight`,
    `  - ${escapeYamlString(baseId)}`,
    ...(scenario.id !== baseId ? [`  - ${escapeYamlString(scenario.id.split('/')[1]!)}`] : []),
  ];

  // Env variables block
  if (env && Object.keys(env).length > 0) {
    lines.push(`env:`);
    for (const [key, value] of Object.entries(env)) {
      lines.push(`  ${key}: ${escapeYamlString(value)}`);
    }
  }

  lines.push(
    `---`,
    `- launchApp:`,
    `    stopApp: false`,
    ``,
    `- openLink:`,
    `    link: ${escapeYamlString('preflight://scenario/' + scenario.id)}`,
    ``,
    `- assertVisible:`,
    `    id: ${escapeYamlString(baseId)}`,
  );

  if (scenario.steps.length > 0) {
    lines.push('');
    for (const step of scenario.steps) {
      const yaml = stepToYaml(step);
      if (yaml) lines.push(yaml);
      lines.push('');
    }
  } else {
    lines.push('');
    lines.push('# Add your test steps below');
    lines.push('');
  }

  lines.push(`- waitForAnimationToEnd`);
  lines.push('');
  lines.push(`- takeScreenshot: ${escapeYamlString(snapshotsDir + '/' + scenario.id + '/current')}`);
  lines.push('');

  return lines.join('\n');
}

export function generateFlowYaml(
  scenario: ScannedScenarioWithVariants,
  appId: AppId,
  snapshotsDir: string = '.maestro/snapshots',
  env?: Record<string, string>,
): string {
  const lines = [
    ...formatAppId(appId),
    `tags:`,
    `  - preflight`,
    `  - flow`,
    `  - ${escapeYamlString(scenario.id)}`,
  ];

  if (env && Object.keys(env).length > 0) {
    lines.push(`env:`);
    for (const [key, value] of Object.entries(env)) {
      lines.push(`  ${key}: ${escapeYamlString(value)}`);
    }
  }

  lines.push(
    `---`,
    `- launchApp:`,
    `    stopApp: false`,
    ``,
    `# Start: ${scenario.id}`,
    `- openLink:`,
    `    link: ${escapeYamlString('preflight://scenario/' + scenario.id)}`,
    ``,
    `- assertVisible:`,
    `    id: ${escapeYamlString(scenario.id)}`,
  );

  // Test steps from the starting scenario
  if (scenario.steps.length > 0) {
    lines.push('');
    for (const step of scenario.steps) {
      const yaml = stepToYaml(step);
      if (yaml) lines.push(yaml);
      lines.push('');
    }
  }

  // Flow steps — navigate through subsequent screens
  for (const flowStep of scenario.flow) {
    if (flowStep.skipIf) {
      lines.push(`# Skip if ${flowStep.skipIf} is already visible`);
      lines.push(`- runFlow:`);
      lines.push(`    when:`);
      lines.push(`      notVisible: ${escapeYamlString(flowStep.skipIf)}`);
      lines.push(`    commands:`);
      lines.push(`      - assertVisible:`);
      lines.push(`          id: ${escapeYamlString(flowStep.screen)}`);
      if (flowStep.steps.length > 0) {
        for (const step of flowStep.steps) {
          const yaml = stepToYaml(step);
          if (yaml) {
            // Indent for runFlow commands
            lines.push('      ' + yaml.replace(/\n/g, '\n      '));
          }
        }
      }
      lines.push('');
    } else {
      lines.push(`# Navigate to: ${flowStep.screen}`);
      lines.push(`- assertVisible:`);
      lines.push(`    id: ${escapeYamlString(flowStep.screen)}`);

      if (flowStep.steps.length > 0) {
        lines.push('');
        for (const step of flowStep.steps) {
          const yaml = stepToYaml(step);
          if (yaml) lines.push(yaml);
          lines.push('');
        }
      } else {
        lines.push('');
      }
    }
  }

  lines.push(`- waitForAnimationToEnd`);
  lines.push('');
  lines.push(`- takeScreenshot: ${escapeYamlString(snapshotsDir + '/flow-' + scenario.id + '/current')}`);
  lines.push('');

  return lines.join('\n');
}

interface GenerateOptions {
  filterIds?: string[];
  quiet?: boolean;
}

export function runGenerate(projectRoot: string, config: PreflightConfig, filterIdsOrOptions?: string[] | GenerateOptions): void {
  const opts: GenerateOptions = Array.isArray(filterIdsOrOptions)
    ? { filterIds: filterIdsOrOptions }
    : filterIdsOrOptions ?? {};
  const { filterIds, quiet } = opts;
  const log = quiet ? () => {} : console.log.bind(console);

  const { srcDir: detectedSrcDir } = detectSrcDir(projectRoot, config);
  const srcDir = path.join(projectRoot, detectedSrcDir);
  const screensDir = path.join(projectRoot, config.screensDir);

  log(`Scanning for scenario() calls in ${detectedSrcDir}/...`);

  fs.mkdirSync(screensDir, { recursive: true });

  const allScanned: ScannedScenarioWithVariants[] = [];
  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('node_modules')) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        const source = fs.readFileSync(fullPath, 'utf-8');
        if (!source.includes('scenario')) continue;
        const found = scanScenarios(source, fullPath);
        allScanned.push(...found);
      }
    }
  }
  scanDir(srcDir);

  // Expand variants into flat list of scenarios for YAML generation
  const allScenarios: ScannedScenario[] = [];
  for (const s of allScanned) {
    const env = Object.keys(s.env).length > 0 ? s.env : undefined;
    if (s.variants.length > 0) {
      for (const v of s.variants) {
        allScenarios.push({
          id: `${s.id}/${v.key}`,
          filePath: s.filePath,
          steps: v.steps.length > 0 ? v.steps : s.steps,
          env,
        });
      }
    } else {
      allScenarios.push({
        id: s.id,
        filePath: s.filePath,
        steps: s.steps,
        env,
      });
    }
  }

  if (allScenarios.length === 0) {
    log(`\n  No scenario() calls found in ${detectedSrcDir}/. Wrap your screens with scenario() or set srcDir in your preflight config.\n`);
    return;
  }

  // Filter to specific IDs if requested
  const scenariosToGenerate = filterIds
    ? allScenarios.filter((s) => filterIds.includes(s.id))
    : allScenarios;

  if (scenariosToGenerate.length === 0) {
    log(`\n  No matching scenarios found for: ${filterIds!.join(', ')}\n`);
    return;
  }

  const genLabel = filterIds ? `Regenerating ${scenariosToGenerate.length} YAML file(s)` : 'Regenerating all YAML files from scenario() definitions';
  log(`  Found: ${allScenarios.map((s) => s.id).join(', ')}\n`);
  log(`  ${genLabel}...\n`);

  let created = 0;
  let updated = 0;

  for (const s of scenariosToGenerate) {
    const yamlPath = s.id.includes('/')
      ? path.join(screensDir, s.id.split('/')[0]!, `${s.id.split('/')[1]!}.yaml`)
      : path.join(screensDir, `${s.id}.yaml`);

    fs.mkdirSync(path.dirname(yamlPath), { recursive: true });

    const yaml = generateYaml(s, config.appId, config.snapshotsDir, s.env);
    validateYaml(yaml, s.id);
    const exists = fs.existsSync(yamlPath);
    fs.writeFileSync(yamlPath, yaml);
    const stepCount = s.steps.length;
    const stepLabel = exists ? 'Updated' : 'Created';
    if (exists) { updated++; } else { created++; }
    log(`  ${stepLabel} ${s.id}.yaml${stepCount > 0 ? ` (${stepCount} steps)` : ''}`);
  }

  // Generate flow YAMLs for scenarios with flow: [...]
  const flowsDir = path.join(projectRoot, '.maestro/flows');
  const scenariosWithFlows = allScanned.filter((s) => s.flow.length > 0);
  if (!filterIds || scenariosWithFlows.some((s) => filterIds.includes(s.id))) {
    for (const s of scenariosWithFlows) {
      if (filterIds && !filterIds.includes(s.id)) continue;
      fs.mkdirSync(flowsDir, { recursive: true });
      const flowPath = path.join(flowsDir, `${s.id}.yaml`);
      const env = Object.keys(s.env).length > 0 ? s.env : undefined;
      const yaml = generateFlowYaml(s, config.appId, config.snapshotsDir, env);
      validateYaml(yaml, `flow-${s.id}`);
      const exists = fs.existsSync(flowPath);
      fs.writeFileSync(flowPath, yaml);
      const flowLabel = exists ? 'Updated' : 'Created';
      if (exists) { updated++; } else { created++; }
      log(`  ${flowLabel} flow: ${s.id}.yaml (${s.flow.length} screens)`);
    }
  }

  // Delete orphaned YAML files (only on full generate, not filtered)
  if (!filterIds) {
    const knownIds = new Set(allScenarios.map((s) => s.id));
    let deleted = 0;
    function cleanOrphans(dir: string, prefix: string = '') {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          cleanOrphans(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
          // Remove empty directories
          const dirPath = path.join(dir, entry.name);
          if (fs.readdirSync(dirPath).length === 0) {
            fs.rmdirSync(dirPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
          const id = prefix ? `${prefix}/${entry.name.replace('.yaml', '')}` : entry.name.replace('.yaml', '');
          if (!knownIds.has(id)) {
            fs.unlinkSync(path.join(dir, entry.name));
            log(`  Deleted ${id}.yaml (no matching scenario)`);
            deleted++;
          }
        }
      }
    }
    cleanOrphans(screensDir);

    // Clean orphaned flow YAMLs
    const knownFlowIds = new Set(scenariosWithFlows.map((s) => s.id));
    if (fs.existsSync(flowsDir)) {
      const flowEntries = fs.readdirSync(flowsDir, { withFileTypes: true });
      for (const entry of flowEntries) {
        if (entry.isFile() && entry.name.endsWith('.yaml')) {
          const id = entry.name.replace('.yaml', '');
          if (!knownFlowIds.has(id)) {
            fs.unlinkSync(path.join(flowsDir, entry.name));
            log(`  Deleted flow: ${id}.yaml (no matching scenario)`);
            deleted++;
          }
        }
      }
    }

    if (deleted > 0) {
      log(`  ${deleted} orphaned file(s) removed`);
    }
  }

  log(`\n  ${created} created, ${updated} updated`);
}
