import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { compareImages } from '../snapshot/compare';
import { generateReport } from '../snapshot/report';
import { findSnapshotDirs } from '../snapshot/utils';
import type { PreflightConfig } from '../config';

interface CompareOptions {
  threshold?: string;
  ci?: boolean;
}

export function runSnapshotCompare(
  options: CompareOptions,
  projectRoot: string,
  config: PreflightConfig,
): void {
  const snapshotsDir = path.join(projectRoot, config.snapshotsDir);
  const threshold = options.threshold ? parseFloat(options.threshold) : config.threshold;

  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    console.error(`[preflight] Invalid threshold: ${options.threshold}. Must be between 0 and 100.`);
    process.exit(1);
  }

  if (!fs.existsSync(snapshotsDir)) {
    console.error('[preflight] No snapshots directory. Run: npx preflight test --snapshot');
    process.exit(1);
  }

  const scenarios = findSnapshotDirs(snapshotsDir);

  const reportEntries: Array<{
    id: string;
    diffPercentage: number;
    passed: boolean;
    baselinePath: string;
    currentPath: string;
    diffPath?: string;
  }> = [];

  let hasFailure = false;

  for (const id of scenarios) {
    const baselinePath = path.join(snapshotsDir, id, 'baseline.png');
    const currentPath = path.join(snapshotsDir, id, 'current.png');

    if (!fs.existsSync(baselinePath) || !fs.existsSync(currentPath)) {
      console.log(`  Skipped ${id} (missing baseline or current)`);
      continue;
    }

    const baseline = fs.readFileSync(baselinePath);
    const current = fs.readFileSync(currentPath);
    const result = compareImages(baseline, current);

    const passed = result.diffPercentage <= threshold;
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${id}: ${result.diffPercentage.toFixed(3)}% diff`);

    let diffPath: string | undefined;
    if (result.diffPng) {
      diffPath = path.join(snapshotsDir, id, 'diff.png');
      fs.writeFileSync(diffPath, result.diffPng);
    }

    if (!passed) hasFailure = true;

    reportEntries.push({ id, diffPercentage: result.diffPercentage, passed, baselinePath, currentPath, diffPath });
  }

  const reportPath = path.join(snapshotsDir, 'report.html');
  generateReport(reportEntries, reportPath);
  console.log(`\nReport: ${reportPath}`);

  // Auto-open report in browser (non-blocking, ignore errors)
  if (!options.ci) {
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} "${reportPath}"`);
  }

  if (hasFailure && options.ci) {
    process.exit(1);
  }
}
