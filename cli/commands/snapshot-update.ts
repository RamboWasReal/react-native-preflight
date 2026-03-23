import * as fs from 'fs';
import * as path from 'path';
import { findSnapshotDirs } from '../snapshot/utils';
import type { PreflightConfig } from '../config';

function validateSnapshotPath(id: string): boolean {
  return id.split('/').every((part) => /^[a-zA-Z0-9_-]+$/.test(part));
}

export function runSnapshotUpdate(
  id: string | undefined,
  projectRoot: string,
  config: PreflightConfig,
): void {
  const snapshotsDir = path.join(projectRoot, config.snapshotsDir);

  if (!fs.existsSync(snapshotsDir)) {
    console.error('[preflight] No snapshots directory found. Run: npx preflight test --snapshot');
    process.exit(1);
  }

  if (id && !validateSnapshotPath(id)) {
    console.error('[preflight] Invalid scenario id. Use only letters, numbers, hyphens, and underscores.');
    process.exit(1);
  }

  const scenarios = id
    ? [id]
    : findSnapshotDirs(snapshotsDir);

  for (const scenarioId of scenarios) {
    const currentPath = path.join(snapshotsDir, scenarioId, 'current.png');
    const baselinePath = path.join(snapshotsDir, scenarioId, 'baseline.png');
    const diffPath = path.join(snapshotsDir, scenarioId, 'diff.png');

    if (!fs.existsSync(currentPath)) {
      console.log(`  Skipped ${scenarioId} (no current screenshot)`);
      continue;
    }

    fs.copyFileSync(currentPath, baselinePath);
    if (fs.existsSync(diffPath)) fs.unlinkSync(diffPath);
    console.log(`  Updated ${scenarioId} baseline`);
  }
}
