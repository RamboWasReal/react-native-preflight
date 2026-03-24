import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import prompts from 'prompts';
import { validateScenarioId, type PreflightConfig } from '../config';
import { runGenerate } from './generate';

function resolveAppId(config: PreflightConfig, platform?: 'ios' | 'android'): { appId: string; env?: [string, string] } {
  if (typeof config.appId === 'string') {
    return { appId: config.appId };
  }
  if (!platform) {
    console.error('[preflight] Multi-platform appId requires --platform ios or --platform android.');
    process.exit(1);
  }
  return { appId: config.appId[platform], env: ['APP_ID', config.appId[platform]] };
}

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  clearLine: '\x1b[2K\r',
};

interface TestOptions {
  all?: boolean;
  snapshot?: boolean;
  retry?: string;
  platform?: 'ios' | 'android';
}

interface FlowResult {
  name: string;
  displayName: string;
  passed: boolean;
  duration?: string;
  failReason?: string;
}

function findYamlFilesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findYamlFilesRecursively(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      results.push(fullPath);
    }
  }
  return results;
}

function validateScenarioPath(id: string): boolean {
  return id.split('/').every((part) => validateScenarioId(part));
}

function getScenarioName(screensDir: string, yamlPath: string): string {
  return path.relative(screensDir, yamlPath).replace(/\.yaml$/, '');
}

function formatFailure(name: string, failReason?: string, debugPath?: string): string {
  const lines: string[] = [];
  lines.push(`  ${c.red('FAIL')}  ${c.bold(name)}`);

  if (failReason) {
    lines.push(`        ${c.red(failReason)}`);
  }

  lines.push('');
  lines.push(`        ${c.dim('Possible causes:')}`);

  if (failReason?.includes('is visible')) {
    lines.push(`        ${c.dim('- Screen may still be loading (missing inject()?)')}`);
    lines.push(`        ${c.dim('- testID may not exist on the component')}`);
    lines.push(`        ${c.dim('- Deep link may not have navigated correctly')}`);
  } else if (failReason?.includes('text')) {
    lines.push(`        ${c.dim('- Text content may differ from expected')}`);
    lines.push(`        ${c.dim('- Screen may still be loading (missing inject()?)')}`);
  } else {
    lines.push(`        ${c.dim('- Check the debug artifacts for screenshots')}`);
    lines.push(`        ${c.dim('- Screen may still be loading (missing inject()?)')}`);
  }

  if (debugPath) {
    lines.push('');
    lines.push(`        ${c.dim('Logs:')} ${debugPath}`);
  }

  return lines.join('\n');
}

function renderProgress(total: number, completed: number, current?: string): void {
  const remaining = total - completed;
  let line = `  ${c.bold(`${completed}/${total}`)} done`;
  if (remaining > 0 && current) {
    line += ` ${c.dim(`— running ${current}...`)}`;
  }
  process.stdout.write(`${c.clearLine}${line}`);
}

function findFlowYamls(projectRoot: string): string[] {
  const flowsDir = path.join(projectRoot, '.maestro/flows');
  return findYamlFilesRecursively(flowsDir);
}

function getFlowName(projectRoot: string, yamlPath: string): string {
  const flowsDir = path.join(projectRoot, '.maestro/flows');
  return path.relative(flowsDir, yamlPath).replace(/\.yaml$/, '');
}

async function promptScenarioSelection(screensDir: string, projectRoot: string): Promise<{ yamls: string[]; isFlow: Map<string, boolean> }> {
  const screenYamls = findYamlFilesRecursively(screensDir);
  const flowYamls = findFlowYamls(projectRoot);

  if (screenYamls.length === 0 && flowYamls.length === 0) {
    console.log('[preflight] No YAML files found. Run: npx preflight generate');
    process.exit(1);
  }

  const choices = [
    ...screenYamls.map((yamlPath) => {
      const name = getScenarioName(screensDir, yamlPath);
      return { title: name, value: yamlPath };
    }),
    ...flowYamls.map((yamlPath) => {
      const name = getFlowName(projectRoot, yamlPath);
      return { title: `${c.dim('[flow]')} ${name}`, value: yamlPath };
    }),
  ];

  const response = await prompts({
    type: 'multiselect',
    name: 'scenarios',
    message: 'Select scenarios to run',
    choices,
    instructions: false,
    hint: '- Space to select, Enter to run',
  });

  if (!response.scenarios || response.scenarios.length === 0) {
    console.log('[preflight] No scenarios selected.');
    process.exit(0);
  }

  const isFlow = new Map<string, boolean>();
  const flowSet = new Set(flowYamls);
  for (const yaml of response.scenarios as string[]) {
    isFlow.set(yaml, flowSet.has(yaml));
  }

  return { yamls: response.scenarios, isFlow };
}

function runMaestroWithStreaming(
  tempDir: string,
  maestroOutput: string,
  projectRoot: string,
  flowToName: Map<string, string>,
  total: number,
  envArgs: string[] = [],
): Promise<{ results: FlowResult[]; debugPath?: string; exitCode: number; rawStderr: string }> {
  return new Promise((resolve) => {
    const results: FlowResult[] = [];
    let debugPath: string | undefined;
    let completed = 0;
    let currentFlow: string | undefined;
    const stderrChunks: string[] = [];

    renderProgress(total, 0);

    const proc = spawn('maestro', ['test', ...envArgs, '--output', maestroOutput, tempDir], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';

    function processLine(line: string) {
      // Multi-test: [Passed] name (Xs)
      const passedMatch = line.match(/\[Passed\]\s+(.+?)\s+\((\d+)s\)/);
      if (passedMatch) {
        const flowName = passedMatch[1]!;
        const displayName = flowToName.get(flowName) ?? flowName;
        results.push({ name: flowName, displayName, passed: true, duration: passedMatch[2]! + 's' });
        completed++;
        renderProgress(total, completed);
        return;
      }

      // Multi-test: [Failed] name (Xs) (reason)
      const failedMatch = line.match(/\[Failed\]\s+(.+?)\s+\((\d+)s\)\s*\((.+)\)/);
      if (failedMatch) {
        const flowName = failedMatch[1]!;
        const displayName = flowToName.get(flowName) ?? flowName;
        results.push({ name: flowName, displayName, passed: false, duration: failedMatch[2]! + 's', failReason: failedMatch[3]! });
        completed++;
        renderProgress(total, completed);
        return;
      }

      // Multi-test: [Failed] name (Xs) — no reason
      const failedNoReason = line.match(/\[Failed\]\s+(.+?)\s+\((\d+)s\)/);
      if (failedNoReason) {
        const flowName = failedNoReason[1]!;
        const displayName = flowToName.get(flowName) ?? flowName;
        results.push({ name: flowName, displayName, passed: false, duration: failedNoReason[2]! + 's' });
        completed++;
        renderProgress(total, completed);
        return;
      }

      // Detect current flow starting (Maestro logs flow names as they begin)
      const flowStart = line.match(/Running\s+(.+?)\.{3}|Executing\s+(.+)/);
      if (flowStart) {
        currentFlow = flowStart[1] ?? flowStart[2];
        if (currentFlow) {
          const displayName = flowToName.get(currentFlow) ?? currentFlow;
          renderProgress(total, completed, displayName);
        }
      }

      // Debug path
      const debugMatch = line.match(/(\/\S+\/\.maestro\/tests\/\S+)/);
      if (debugMatch) {
        debugPath = debugMatch[1]!;
      }
    }

    function processBuffer(data: string) {
      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // Keep incomplete last line in buffer
      for (const line of lines) {
        processLine(line);
      }
    }

    proc.stdout.on('data', (data: Buffer) => processBuffer(data.toString()));
    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrChunks.push(text);
      processBuffer(text);
    });

    proc.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) processLine(buffer);
      // Clear progress line
      process.stdout.write(c.clearLine);
      resolve({ results, debugPath, exitCode: code ?? 1, rawStderr: stderrChunks.join('') });
    });
  });
}

export async function runTest(
  idOrUndefined: string | undefined,
  options: TestOptions,
  projectRoot: string,
  config: PreflightConfig,
): Promise<void> {
  const screensDir = path.join(projectRoot, config.screensDir);

  let yamlFiles: string[];
  let flowFiles = new Set<string>();

  if (options.all) {
    runGenerate(projectRoot, config, { quiet: true });
    yamlFiles = [
      ...findYamlFilesRecursively(screensDir),
      ...findFlowYamls(projectRoot),
    ];
    const flows = findFlowYamls(projectRoot);
    for (const f of flows) flowFiles.add(f);
  } else if (idOrUndefined) {
    if (!validateScenarioPath(idOrUndefined)) {
      console.error('[preflight] Invalid scenario id. Use only letters, numbers, hyphens, and underscores.');
      process.exit(1);
    }
    // Check flows first
    const flowPath = path.join(projectRoot, '.maestro/flows', `${idOrUndefined}.yaml`);
    if (fs.existsSync(flowPath)) {
      yamlFiles = [flowPath];
      flowFiles.add(flowPath);
    } else {
      runGenerate(projectRoot, config, { filterIds: [idOrUndefined], quiet: true });
      let yamlPath = path.join(screensDir, `${idOrUndefined}.yaml`);
      if (!fs.existsSync(yamlPath) && idOrUndefined.includes('/')) {
        const [baseId, variantKey] = idOrUndefined.split('/');
        yamlPath = path.join(screensDir, baseId!, `${variantKey!}.yaml`);
      }
      if (!fs.existsSync(yamlPath)) {
        console.error(`[preflight] No YAML found for "${idOrUndefined}". Run: npx preflight generate`);
        process.exit(1);
      }
      yamlFiles = [yamlPath];
    }
  } else {
    runGenerate(projectRoot, config, { quiet: true });
    const selection = await promptScenarioSelection(screensDir, projectRoot);
    yamlFiles = selection.yamls;
    for (const [yaml, isF] of selection.isFlow) {
      if (isF) flowFiles.add(yaml);
    }
  }

  if (yamlFiles.length === 0) {
    console.log('[preflight] No scenarios to run.');
    return;
  }

  const resolved = resolveAppId(config, options.platform);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  try {
    const flowToName = new Map<string, string>();
    for (const yaml of yamlFiles) {
      const isFlow = flowFiles.has(yaml);
      const name = isFlow
        ? `[flow] ${getFlowName(projectRoot, yaml)}`
        : getScenarioName(screensDir, yaml);
      const flowName = name.replace(/[[\] ]/g, '').replace(/\//g, '--');
      const tempPath = path.join(tempDir, flowName + '.yaml');
      fs.copyFileSync(yaml, tempPath);
      flowToName.set(flowName, name);
    }

    const total = yamlFiles.length;
    console.log(`\n  ${c.bold(`Running ${total} scenario(s)`)}\n`);

    const maestroOutput = path.join(projectRoot, '.maestro-output');
    fs.mkdirSync(maestroOutput, { recursive: true });

    const maxRetries = options.retry ? Math.max(0, parseInt(options.retry, 10)) : 0;
    const envArgs = resolved.env ? ['-e', `${resolved.env[0]}=${resolved.env[1]}`] : [];
    let attempt = 0;
    let results: FlowResult[] = [];
    let debugPath: string | undefined;
    let rawStderr = '';
    let exitCode: number;

    do {
      if (attempt > 0) {
        console.log(`\n  ${c.yellow(`Retry ${attempt}/${maxRetries}`)} — re-running failed tests...\n`);
      }
      const run = await runMaestroWithStreaming(
        tempDir, maestroOutput, projectRoot, flowToName, total, envArgs,
      );
      results = run.results;
      debugPath = run.debugPath;
      exitCode = run.exitCode;
      rawStderr = run.rawStderr;
      attempt++;
    } while (exitCode !== 0 && attempt <= maxRetries);

    const allPassed = exitCode === 0;

    // If Maestro returned results, use them. Otherwise fall back to exit code.
    const passCount = results.length > 0 ? results.filter((r) => r.passed).length : (allPassed ? total : 0);
    const failCount = results.length > 0 ? results.filter((r) => !r.passed).length : (allPassed ? 0 : total);

    // Show results
    if (results.length > 0) {
      for (const r of results) {
        if (r.passed) {
          console.log(`  ${c.green('PASS')}  ${r.displayName} ${c.dim(`(${r.duration})`)}`);
        }
      }
      // Show failures after passes
      for (const r of results) {
        if (!r.passed) {
          console.log(formatFailure(r.displayName, r.failReason, debugPath));
        }
      }
    } else if (!allPassed) {
      // No parsed results — Maestro likely crashed (YAML parse error, etc.)
      for (const name of flowToName.values()) {
        console.log(`  ${c.red('FAIL')}  ${c.bold(name)}`);
      }
      if (rawStderr.trim()) {
        console.log(`\n  ${c.dim('Maestro error:')}`);
        for (const line of rawStderr.trim().split('\n')) {
          console.log(`  ${c.red(line)}`);
        }
      }
    } else {
      for (const name of flowToName.values()) {
        console.log(`  ${c.green('PASS')}  ${name}`);
      }
    }

    // Snapshots — process each passed test individually (not gated on allPassed)
    if (options.snapshot) {
      const passedNames = results.length > 0
        ? results.filter((r) => r.passed).map((r) => r.displayName)
        : (allPassed ? Array.from(flowToName.values()) : []);

      for (const name of passedNames) {
        const snapshotsDir = path.join(projectRoot, config.snapshotsDir, name);
        const currentPath = path.join(snapshotsDir, 'current.png');
        const baselinePath = path.join(snapshotsDir, 'baseline.png');
        if (fs.existsSync(currentPath)) {
          if (!fs.existsSync(baselinePath)) {
            fs.copyFileSync(currentPath, baselinePath);
            console.log(`  ${c.dim('Baseline created:')} ${name}/baseline.png`);
          } else {
            console.log(`  ${c.dim('Screenshot saved:')} ${name}/current.png`);
          }
        }
      }
    }

    const summary = [
      passCount > 0 ? c.green(`${passCount} passed`) : '',
      failCount > 0 ? c.red(`${failCount} failed`) : '',
    ].filter(Boolean).join(', ');
    console.log(`\n${summary}`);
    if (!allPassed) {
      console.log(`\n  ${c.dim('Output:')} ${maestroOutput}`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
