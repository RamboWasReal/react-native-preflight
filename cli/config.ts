import * as fs from 'fs';
import * as path from 'path';

export type Framework = 'expo-router' | 'react-navigation' | 'unknown';

export interface PreflightConfig {
  appId: string | { ios: string; android: string };
  scheme: string;
  screensDir: string;
  snapshotsDir: string;
  threshold: number;
  srcDir: string;
}

const DEFAULTS: PreflightConfig = {
  appId: '',
  scheme: 'preflight',
  screensDir: '.maestro/screens',
  snapshotsDir: '.maestro/snapshots',
  threshold: 0.1,
  srcDir: '',
};

const CONFIG_KEYS: (keyof PreflightConfig)[] = ['appId', 'scheme', 'screensDir', 'snapshotsDir', 'threshold', 'srcDir'];

const CONFIG_TYPES: Record<keyof PreflightConfig, string> = {
  appId: 'string',
  scheme: 'string',
  screensDir: 'string',
  snapshotsDir: 'string',
  threshold: 'number',
  srcDir: 'string',
};

function validateAppId(value: unknown): string | { ios: string; android: string } | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.ios === 'string' && typeof obj.android === 'string') {
      return { ios: obj.ios, android: obj.android };
    }
  }
  return undefined;
}

function pickConfig(source: Record<string, unknown>): PreflightConfig {
  const config = { ...DEFAULTS };
  for (const key of CONFIG_KEYS) {
    if (key in source && source[key] !== undefined) {
      if (key === 'appId') {
        const appId = validateAppId(source[key]);
        if (appId !== undefined) {
          config.appId = appId;
        } else {
          console.warn('[preflight] Config "appId" should be a string or { ios, android } object. Using default.');
        }
        continue;
      }
      const expected = CONFIG_TYPES[key];
      if (typeof source[key] !== expected) {
        console.warn(`[preflight] Config "${key}" should be a ${expected}, got ${typeof source[key]}. Using default.`);
        continue;
      }
      (config as any)[key] = source[key];
    }
  }
  return config;
}

const PATH_KEYS: (keyof PreflightConfig)[] = ['screensDir', 'snapshotsDir', 'srcDir'];

function validatePaths(config: PreflightConfig, projectRoot: string): PreflightConfig {
  const resolvedRoot = path.resolve(projectRoot);
  for (const key of PATH_KEYS) {
    const value = config[key];
    if (typeof value === 'string' && value) {
      const resolved = path.resolve(projectRoot, value);
      if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
        console.error(`[preflight] Config "${key}" resolves outside project root. Using default.`);
        (config as any)[key] = (DEFAULTS as any)[key];
      }
    }
  }
  return config;
}

export function loadConfig(projectRoot: string): PreflightConfig {
  const configPath = path.join(projectRoot, 'preflight.config.js');
  if (fs.existsSync(configPath)) {
    const userConfig = require(configPath);
    return validatePaths(pickConfig(userConfig), projectRoot);
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      console.error('[preflight] Failed to parse package.json');
      return { ...DEFAULTS };
    }
    if (pkg.preflight) {
      return validatePaths(pickConfig(pkg.preflight as Record<string, unknown>), projectRoot);
    }
    const appJsonPath = path.join(projectRoot, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      let appJson: Record<string, unknown>;
      try {
        appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
      } catch {
        console.error('[preflight] Failed to parse app.json');
        return { ...DEFAULTS };
      }
      const appId = (appJson as any)?.expo?.ios?.bundleIdentifier || (appJson as any)?.expo?.android?.package || '';
      return validatePaths({ ...DEFAULTS, appId }, projectRoot);
    }
  }

  return { ...DEFAULTS };
}

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateScenarioId(id: string): boolean {
  return VALID_ID_PATTERN.test(id);
}

const LAYOUT_FILES = ['_layout.tsx', '_layout.ts', '_layout.jsx', '_layout.js'];

function hasLayout(dir: string): boolean {
  return LAYOUT_FILES.some((f) => fs.existsSync(path.join(dir, f)));
}

export function detectSrcDir(projectRoot: string, config: PreflightConfig): { srcDir: string; framework: Framework } {
  // 1. Explicit config
  if (config.srcDir) {
    const fullPath = path.join(projectRoot, config.srcDir);
    if (!fs.existsSync(fullPath)) {
      console.error(`[preflight] Configured srcDir "${config.srcDir}" does not exist.`);
      process.exit(1);
    }
    // Detect framework even when srcDir is explicit
    const framework: Framework = hasLayout(fullPath) ? 'expo-router' : 'unknown';
    return { srcDir: config.srcDir, framework };
  }

  // 2. app/_layout.tsx → Expo Router
  const appDir = path.join(projectRoot, 'app');
  if (fs.existsSync(appDir) && hasLayout(appDir)) {
    return { srcDir: 'app', framework: 'expo-router' };
  }

  // 3. src/app/_layout.tsx → Expo Router
  const srcAppDir = path.join(projectRoot, 'src/app');
  if (fs.existsSync(srcAppDir) && hasLayout(srcAppDir)) {
    console.log('[preflight] Using src/app/ as source directory');
    return { srcDir: 'src/app', framework: 'expo-router' };
  }

  // 4. src/screens/ → React Navigation
  const srcScreensDir = path.join(projectRoot, 'src/screens');
  if (fs.existsSync(srcScreensDir)) {
    console.log('[preflight] Using src/screens/ as source directory');
    return { srcDir: 'src/screens', framework: 'react-navigation' };
  }

  // 5. src/ → generic
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    console.log('[preflight] Using src/ as source directory');
    return { srcDir: 'src', framework: 'unknown' };
  }

  // 6. Nothing found
  console.error('[preflight] No app/, src/app/, src/screens/, or src/ directory found. Set srcDir in your preflight config.');
  process.exit(1);
}
