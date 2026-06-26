import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import { detectSrcDir, validateScenarioId } from '../config';
import type { PreflightConfig } from '../config';

// Handle @babel/traverse CJS/ESM interop
const traverseModule = require('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

interface ElementSelector {
  text?: string;
  id?: string;
  index?: number;
  enabled?: boolean;
  checked?: boolean;
  focused?: boolean;
  selected?: boolean;
  below?: string | ElementSelector;
  above?: string | ElementSelector;
  leftOf?: string | ElementSelector;
  rightOf?: string | ElementSelector;
  containsChild?: string | ElementSelector;
  point?: string;
}

interface TestStep {
  tap?: string | ElementSelector;
  see?: string | ElementSelector;
  notSee?: string | ElementSelector;
  type?: [string, string];
  wait?: number;
  scroll?: [string, string];
  swipe?: [string, number?];
  back?: true;
  hideKeyboard?: true;
  longPress?: string | ElementSelector;
  doubleTap?: string | ElementSelector;
  raw?: string;
  navigate?: string;
  openLink?: string;
  eraseText?: number;
  pressKey?: string;
  extendedWaitUntil?: { visible?: ElementSelector; notVisible?: ElementSelector; timeout?: number };
  assertTrue?: string;
  setLocation?: { latitude: number; longitude: number };
  copyTextFrom?: string | ElementSelector;
  pasteText?: true;
  setClipboard?: string;
  assertScreenshot?: string | { path?: string; cropOn?: ElementSelector; thresholdPercentage?: number };
  assertWithAI?: string;
  assertNoDefectsWithAI?: true;
  extractTextWithAI?: string | { query: string; outputVariable?: string };
}

interface ScannedScenario {
  id: string;
  filePath: string;
  steps: TestStep[];
  env?: Record<string, string>;
  launchOptions?: any;
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

function parseSelectorObject(objNode: any): any {
  const result: any = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
    const key = prop.key.name;
    if (prop.value.type === 'StringLiteral') {
      result[key] = prop.value.value;
    } else if (prop.value.type === 'NumericLiteral') {
      result[key] = prop.value.value;
    } else if (prop.value.type === 'BooleanLiteral') {
      result[key] = prop.value.value;
    } else if (prop.value.type === 'ObjectExpression') {
      result[key] = parseSelectorObject(prop.value);
    } else if (prop.value.type === 'ArrayExpression') {
      result[key] = prop.value.elements
        .filter((el: any) => el?.type === 'StringLiteral' || el?.type === 'ObjectExpression')
        .map((el: any) => el.type === 'StringLiteral' ? el.value : parseSelectorObject(el));
    }
  }
  return result;
}

function parseExtendedWaitObject(objNode: any): any {
  const result: any = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
    const key = prop.key.name;
    if (key === 'timeout' && prop.value.type === 'NumericLiteral') {
      result.timeout = prop.value.value;
    } else if ((key === 'visible' || key === 'notVisible') && (prop.value.type === 'StringLiteral' || prop.value.type === 'ObjectExpression')) {
      result[key] = prop.value.type === 'StringLiteral' ? prop.value.value : parseSelectorObject(prop.value);
    }
  }
  return result;
}

function parseAssertScreenshotObject(objNode: any): any {
  const result: any = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
    const key = prop.key.name;
    if (prop.value.type === 'StringLiteral') {
      if (key === 'path') result.path = prop.value.value;
    } else if (prop.value.type === 'NumericLiteral' && key === 'thresholdPercentage') {
      result.thresholdPercentage = prop.value.value;
    } else if (key === 'cropOn' && prop.value.type === 'ObjectExpression') {
      result.cropOn = parseSelectorObject(prop.value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseExtractTextObject(objNode: any): any {
  const result: any = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
    const key = prop.key.name;
    if (prop.value.type === 'StringLiteral') {
      if (key === 'query') result.query = prop.value.value;
      if (key === 'outputVariable') result.outputVariable = prop.value.value;
    }
  }
  return result;
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
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ tap: parseSelectorObject(args[0]) });
          }
          break;
        case 'see':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ see: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ see: parseSelectorObject(args[0]) });
          }
          break;
        case 'notSee':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ notSee: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ notSee: parseSelectorObject(args[0]) });
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
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ longPress: parseSelectorObject(args[0]) });
          }
          break;
        case 'doubleTap':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ doubleTap: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ doubleTap: parseSelectorObject(args[0]) });
          }
          break;
        case 'eraseText':
          if (args[0]?.type === 'NumericLiteral') {
            steps.push({ eraseText: args[0].value });
          } else {
            steps.push({ eraseText: undefined });
          }
          break;
        case 'pressKey':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ pressKey: args[0].value });
          }
          break;
        case 'extendedWaitUntil':
          if (args[0]?.type === 'ObjectExpression') {
            steps.push({ extendedWaitUntil: parseExtendedWaitObject(args[0]) });
          }
          break;
        case 'assertTrue':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ assertTrue: args[0].value });
          }
          break;
        case 'setLocation':
          if (args[0]?.type === 'NumericLiteral' && args[1]?.type === 'NumericLiteral') {
            steps.push({ setLocation: { latitude: args[0].value, longitude: args[1].value } });
          }
          break;
        case 'copyTextFrom':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ copyTextFrom: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ copyTextFrom: parseSelectorObject(args[0]) });
          }
          break;
        case 'pasteText':
          steps.push({ pasteText: true });
          break;
        case 'setClipboard':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ setClipboard: args[0].value });
          }
          break;
        case 'assertScreenshot':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ assertScreenshot: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ assertScreenshot: parseAssertScreenshotObject(args[0]) });
          }
          break;
        case 'assertWithAI':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ assertWithAI: args[0].value });
          }
          break;
        case 'assertNoDefectsWithAI':
          steps.push({ assertNoDefectsWithAI: true });
          break;
        case 'extractTextWithAI':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ extractTextWithAI: args[0].value });
          } else if (args[0]?.type === 'ObjectExpression') {
            steps.push({ extractTextWithAI: parseExtractTextObject(args[0]) });
          }
          break;
        case 'raw':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ raw: args[0].value });
          }
          break;
        case 'navigate':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ navigate: args[0].value });
          }
          break;
        case 'openLink':
          if (args[0]?.type === 'StringLiteral') {
            steps.push({ openLink: args[0].value });
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

function extractFlow(firstArg: any, ast?: any, filePath?: string): ScannedFlowStep[] {
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
      if (fnNode.type === 'Identifier' && ast && filePath) {
        const resolved = resolveImportedFunction(fnNode.name, ast, filePath);
        steps = resolved ? extractTestSteps(resolved) : [];
      } else {
        steps = extractTestSteps(fnNode);
      }
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
      const flow = extractFlow(firstArg, ast, filePath);

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

      // Parse launchOptions
      let launchOptions: any;
      const launchProp = firstArg.properties.find(
        (p: any) =>
          p.type === 'ObjectProperty' &&
          p.key.type === 'Identifier' &&
          p.key.name === 'launchOptions' &&
          p.value.type === 'ObjectExpression',
      );
      if (launchProp) {
        launchOptions = {};
        for (const prop of launchProp.value.properties) {
          if (prop.type !== 'ObjectProperty') continue;
          const k = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
          if (prop.value.type === 'BooleanLiteral') launchOptions[k] = prop.value.value;
          if (prop.value.type === 'ObjectExpression') {
            const perms: any = {};
            for (const pp of prop.value.properties) {
              if (pp.type === 'ObjectProperty' && pp.value.type === 'StringLiteral') {
                const pk = pp.key.type === 'Identifier' ? pp.key.name : pp.key.value;
                perms[pk] = pp.value.value;
              }
            }
            launchOptions[k] = perms;
          }
        }
      }

      results.push({ id, filePath, steps, variants, flow, env, launchOptions });
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

function routeToLink(route: string, scheme: string): string {
  const normalized = route.startsWith('/') ? route.slice(1) : route;
  return `${scheme}://${normalized}`;
}

const MAESTRO_COMMANDS = new Set([
  'launchApp', 'stopApp', 'clearState', 'clearKeychain',
  'tapOn', 'doubleTapOn', 'longPressOn', 'swipe', 'scroll',
  'scrollUntilVisible', 'inputText', 'eraseText', 'pressKey',
  'openLink', 'navigate', 'assertVisible', 'assertNotVisible',
  'assertTrue', 'assertWithAI', 'assertNoDefectsWithAI', 'extractTextWithAI', 'takeScreenshot', 'setLocation',
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

function formatSelector(sel: string | ElementSelector | undefined): string {
  if (!sel) return '';
  if (typeof sel === 'string') {
    return `    text: ${escapeYamlString(sel)}`;
  }
  const lines: string[] = [];
  if (sel.id) lines.push(`    id: ${escapeYamlString(sel.id)}`);
  if (sel.text) lines.push(`    text: ${escapeYamlString(sel.text)}`);
  if (sel.index !== undefined) lines.push(`    index: ${sel.index}`);
  if (sel.enabled !== undefined) lines.push(`    enabled: ${sel.enabled}`);
  if (sel.checked !== undefined) lines.push(`    checked: ${sel.checked}`);
  if (sel.focused !== undefined) lines.push(`    focused: ${sel.focused}`);
  if (sel.selected !== undefined) lines.push(`    selected: ${sel.selected}`);
  if (sel.point) lines.push(`    point: ${escapeYamlString(sel.point)}`);
  if (sel.below) lines.push(`    below: ${typeof sel.below === 'string' ? escapeYamlString(sel.below) : '\n' + formatSelector(sel.below).replace(/^    /gm, '      ')}`);
  if (sel.above) lines.push(`    above: ${typeof sel.above === 'string' ? escapeYamlString(sel.above) : '\n' + formatSelector(sel.above).replace(/^    /gm, '      ')}`);
  if (sel.leftOf) lines.push(`    leftOf: ${typeof sel.leftOf === 'string' ? escapeYamlString(sel.leftOf) : '\n' + formatSelector(sel.leftOf).replace(/^    /gm, '      ')}`);
  if (sel.rightOf) lines.push(`    rightOf: ${typeof sel.rightOf === 'string' ? escapeYamlString(sel.rightOf) : '\n' + formatSelector(sel.rightOf).replace(/^    /gm, '      ')}`);
  if (sel.containsChild) {
    const child = typeof sel.containsChild === 'string' ? sel.containsChild : '';
    lines.push(`    containsChild: ${escapeYamlString(child)}`);
  }
  return lines.join('\n');
}

function stepToYaml(step: TestStep, scheme: string = 'preflight'): string {
  if (step.tap) {
    if (typeof step.tap === 'string') {
      return `- tapOn:\n    id: ${escapeYamlString(step.tap)}`;
    }
    return `- tapOn:\n${formatSelector(step.tap)}`;
  }
  if (step.see !== undefined) {
    if (typeof step.see === 'string') {
      return `- assertVisible:\n    text: ${escapeYamlString(step.see)}`;
    }
    return `- assertVisible:\n${formatSelector(step.see)}`;
  }
  if (step.notSee) {
    if (typeof step.notSee === 'string') {
      return `- assertNotVisible:\n    text: ${escapeYamlString(step.notSee)}`;
    }
    return `- assertNotVisible:\n${formatSelector(step.notSee)}`;
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
    if (typeof step.longPress === 'string') {
      return `- longPressOn:\n    id: ${escapeYamlString(step.longPress)}`;
    }
    return `- longPressOn:\n${formatSelector(step.longPress)}`;
  }
  if (step.doubleTap) {
    if (typeof step.doubleTap === 'string') {
      return `- doubleTapOn:\n    id: ${escapeYamlString(step.doubleTap)}`;
    }
    return `- doubleTapOn:\n${formatSelector(step.doubleTap)}`;
  }
  if (step.eraseText !== undefined) {
    return step.eraseText === undefined || step.eraseText === null
      ? `- eraseText`
      : `- eraseText: ${step.eraseText}`;
  }
  if (step.pressKey) {
    return `- pressKey: ${escapeYamlString(step.pressKey)}`;
  }
  if (step.extendedWaitUntil) {
    const w = step.extendedWaitUntil;
    const lines = ['- extendedWaitUntil:'];
    if (w.visible) {
      lines.push('    visible:');
      if (typeof w.visible === 'string') lines.push(`      text: ${escapeYamlString(w.visible)}`);
      else lines.push(formatSelector(w.visible).replace(/^    /gm, '      '));
    }
    if (w.notVisible) {
      lines.push('    notVisible:');
      if (typeof w.notVisible === 'string') lines.push(`      text: ${escapeYamlString(w.notVisible)}`);
      else lines.push(formatSelector(w.notVisible).replace(/^    /gm, '      '));
    }
    if (w.timeout) lines.push(`    timeout: ${w.timeout}`);
    return lines.join('\n');
  }
  if (step.assertTrue) {
    return `- assertTrue: ${escapeYamlString(step.assertTrue)}`;
  }
  if (step.setLocation) {
    return `- setLocation:\n    latitude: ${step.setLocation.latitude}\n    longitude: ${step.setLocation.longitude}`;
  }
  if (step.copyTextFrom) {
    if (typeof step.copyTextFrom === 'string') {
      return `- copyTextFrom:\n    id: ${escapeYamlString(step.copyTextFrom)}`;
    }
    return `- copyTextFrom:\n${formatSelector(step.copyTextFrom)}`;
  }
  if (step.pasteText) {
    return `- pasteText`;
  }
  if (step.setClipboard) {
    return `- setClipboard: ${escapeYamlString(step.setClipboard)}`;
  }
  if (step.assertScreenshot !== undefined) {
    if (typeof step.assertScreenshot === 'string') {
      return `- assertScreenshot: ${escapeYamlString(step.assertScreenshot)}`;
    }
    const opts = step.assertScreenshot;
    const lines = ['- assertScreenshot:'];
    if (opts.path) lines.push(`    path: ${escapeYamlString(opts.path)}`);
    if (opts.cropOn) {
      lines.push('    cropOn:');
      if (typeof opts.cropOn === 'string') lines.push(`      text: ${escapeYamlString(opts.cropOn)}`);
      else lines.push(formatSelector(opts.cropOn).replace(/^    /gm, '      '));
    }
    if (opts.thresholdPercentage !== undefined) {
      lines.push(`    thresholdPercentage: ${opts.thresholdPercentage}`);
    }
    return lines.join('\n');
  }
  if (step.assertWithAI) {
    return `- assertWithAI:\n    assertion: ${escapeYamlString(step.assertWithAI)}`;
  }
  if (step.assertNoDefectsWithAI) {
    return `- assertNoDefectsWithAI`;
  }
  if (step.extractTextWithAI) {
    if (typeof step.extractTextWithAI === 'string') {
      return `- extractTextWithAI: ${escapeYamlString(step.extractTextWithAI)}`;
    }
    const e = step.extractTextWithAI;
    const lines = ['- extractTextWithAI:'];
    if (e.query) lines.push(`    query: ${escapeYamlString(e.query)}`);
    if (e.outputVariable) lines.push(`    outputVariable: ${escapeYamlString(e.outputVariable)}`);
    return lines.join('\n');
  }
  if (step.navigate !== undefined) {
    return `- openLink:\n    link: ${escapeYamlString(routeToLink(step.navigate, scheme))}`;
  }
  if (step.openLink !== undefined) {
    return `- openLink:\n    link: ${escapeYamlString(step.openLink)}`;
  }
  if (step.raw) {
    return step.raw;
  }
  return '';
}

export function generateYaml(
  scenario: ScannedScenario,
  appId: AppId,
  snapshotsDir: string = '.maestro/snapshots',
  env?: Record<string, string>,
  scheme: string = 'preflight',
  launchOptions?: any,
): string {
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

  // Build launchApp block with options
  const launchLines = [`- launchApp:`];
  const lo = (scenario as any).launchOptions || launchOptions || {};
  if (lo.clearState !== undefined) launchLines.push(`    clearState: ${lo.clearState}`);
  if (lo.clearKeychain !== undefined) launchLines.push(`    clearKeychain: ${lo.clearKeychain}`);
  if (lo.stopApp !== undefined) launchLines.push(`    stopApp: ${lo.stopApp}`);
  if (lo.permissions && typeof lo.permissions === 'object') {
    launchLines.push(`    permissions:`);
    for (const [perm, val] of Object.entries(lo.permissions)) {
      launchLines.push(`      ${perm}: ${val}`);
    }
  }
  // Default to previous behavior if nothing specified
  if (launchLines.length === 1) {
    launchLines.push(`    stopApp: false`);
  }

  lines.push(
    `---`,
    ...launchLines,
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
      const yaml = stepToYaml(step, scheme);
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
  scheme: string = 'preflight',
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

  // Build launchApp block with options (flow)
  const flowLaunchLines = [`- launchApp:`];
  const flo = (scenario as any).launchOptions || {};
  if (flo.clearState !== undefined) flowLaunchLines.push(`    clearState: ${flo.clearState}`);
  if (flo.clearKeychain !== undefined) flowLaunchLines.push(`    clearKeychain: ${flo.clearKeychain}`);
  if (flo.stopApp !== undefined) flowLaunchLines.push(`    stopApp: ${flo.stopApp}`);
  if (flo.permissions && typeof flo.permissions === 'object') {
    flowLaunchLines.push(`    permissions:`);
    for (const [perm, val] of Object.entries(flo.permissions)) {
      flowLaunchLines.push(`      ${perm}: ${val}`);
    }
  }
  if (flowLaunchLines.length === 1) flowLaunchLines.push(`    stopApp: false`);

  lines.push(
    `---`,
    ...flowLaunchLines,
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
      const yaml = stepToYaml(step, scheme);
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
          const yaml = stepToYaml(step, scheme);
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
          const yaml = stepToYaml(step, scheme);
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

    const yaml = generateYaml(s, config.appId, config.snapshotsDir, s.env, config.scheme, s.launchOptions);
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
      const yaml = generateFlowYaml(s, config.appId, config.snapshotsDir, env, config.scheme);
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
