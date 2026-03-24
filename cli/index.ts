// Note: shebang added via post-build
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { runInit } from './commands/init';
import { loadConfig } from './config';
import { runTest } from './commands/test';
import { runGenerate } from './commands/generate';
import { runSnapshotCompare } from './commands/snapshot-compare';
import { runSnapshotUpdate } from './commands/snapshot-update';
import { runSnapshotReset } from './commands/snapshot-reset';

const program = new Command();

program
  .name('preflight')
  .description('Simplify Maestro E2E testing for React Native')
  .version(JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')).version);

program
  .command('init')
  .description('Initialize preflight in your project')
  .action(() => {
    console.log('Initializing preflight...\n');
    runInit(process.cwd());
  });

program
  .command('test [id]')
  .description('Run Maestro test for a scenario')
  .option('--all', 'Run all scenarios')
  .option('--snapshot', 'Capture screenshots')
  .option('--retry <count>', 'Retry failed tests N times')
  .option('--platform <platform>', 'Target platform (ios or android)')
  .action(async (id, options) => {
    const config = loadConfig(process.cwd());
    await runTest(id, options, process.cwd(), config);
  });

program
  .command('generate')
  .description('Generate Maestro YAML skeletons from scenario() calls')
  .action(() => {
    const config = loadConfig(process.cwd());
    runGenerate(process.cwd(), config);
  });

program
  .command('snapshot:compare')
  .description('Compare screenshots against baselines')
  .option('--threshold <percent>', 'Diff tolerance in % (default: 0.1)')
  .option('--ci', 'Exit with code 1 on regression')
  .action((options) => {
    const config = loadConfig(process.cwd());
    runSnapshotCompare(options, process.cwd(), config);
  });

program
  .command('snapshot:update [id]')
  .description('Update baselines with current screenshots')
  .action((id) => {
    const config = loadConfig(process.cwd());
    runSnapshotUpdate(id, process.cwd(), config);
  });

program
  .command('snapshot:reset [id]')
  .description('Reset snapshots (delete baselines, current, and diffs)')
  .action((id) => {
    const config = loadConfig(process.cwd());
    runSnapshotReset(id, process.cwd(), config);
  });

program.parse();
