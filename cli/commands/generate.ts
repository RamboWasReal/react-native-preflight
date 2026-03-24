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
  scroll?: [string, string, number?];
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
            const duration = args[2]?.type === 'NumericLiteral' ? args[2].value : undefined;
            steps.push({ scroll: [args[0].value, args[1].value, duration] });
          }
          break;
      }
    } catch {
      // Skip malformed steps
    }
  }

  return steps;
}


function extractTestFromProp(obj: any): TestStep[] {
  const testProp = obj.properties.find(
    (p: any) =>
      (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') &&
      p.key.type === 'Identifier' &&
      p.key.name === 'test',
  );
  if (testProp) {
    const fnNode = testProp.type === 'ObjectMethod' ? testProp : testProp.value;
    return extractTestSteps(fnNode);
  }
  return [];
}

function extractVariants(firstArg: any): ScannedVariant[] {
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

    const steps = extractTestFromProp(prop.value);
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

      const steps = extractTestFromProp(firstArg);
      const variants = extractVariants(firstArg);
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
    const duration = step.scroll[2] ?? 400;
    return `- swipe:\n    direction: ${step.scroll[1]!.toUpperCase()}\n    duration: ${duration}`;
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

  // Warn about orphaned YAML files (recursive, skip in quiet mode)
  if (!quiet) {
    const knownIds = new Set(allScenarios.map((s) => s.id));
    function findOrphans(dir: string, prefix: string = '') {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          findOrphans(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
          const id = prefix ? `${prefix}/${entry.name.replace('.yaml', '')}` : entry.name.replace('.yaml', '');
          if (!knownIds.has(id)) {
            console.warn(`  [preflight] Warning: ${id}.yaml has no matching scenario() in codebase`);
          }
        }
      }
    }
    findOrphans(screensDir);
  }

  log(`\n  ${created} created, ${updated} updated`);
}
