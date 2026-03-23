import * as fs from 'fs';
import * as path from 'path';

export function findSnapshotDirs(baseDir: string, prefix: string = ''): string[] {
  const results: string[] = [];
  if (!fs.existsSync(baseDir)) return results;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  const hasSnapshots = entries.some(
    (e) => e.isFile() && (e.name === 'baseline.png' || e.name === 'current.png'),
  );
  if (hasSnapshots) {
    results.push(prefix);
    return results;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      results.push(...findSnapshotDirs(path.join(baseDir, entry.name), subPrefix));
    }
  }
  return results;
}
