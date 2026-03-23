import * as fs from 'fs';
import * as path from 'path';
import type { PreflightConfig } from '../config';

function validateSnapshotPath(id: string): boolean {
  return id.split('/').every((part) => /^[a-zA-Z0-9_-]+$/.test(part));
}

export function runSnapshotReset(
  id: string | undefined,
  projectRoot: string,
  config: PreflightConfig,
): void {
  const snapshotsDir = path.join(projectRoot, config.snapshotsDir);

  if (!fs.existsSync(snapshotsDir)) {
    console.log('[preflight] No snapshots directory found. Nothing to reset.');
    return;
  }

  if (id) {
    if (!validateSnapshotPath(id)) {
      console.error('[preflight] Invalid scenario id.');
      process.exit(1);
    }
    const scenarioDir = path.join(snapshotsDir, id);
    if (!fs.existsSync(scenarioDir)) {
      console.log(`[preflight] No snapshots found for "${id}".`);
      return;
    }
    fs.rmSync(scenarioDir, { recursive: true, force: true });
    console.log(`  Reset ${id} snapshots`);
  } else {
    fs.rmSync(snapshotsDir, { recursive: true, force: true });
    fs.mkdirSync(snapshotsDir, { recursive: true });
    console.log('  Reset all snapshots');
  }
}
