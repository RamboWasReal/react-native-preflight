import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, detectSrcDir } from '../config';
import type { Framework } from '../config';

function scaffoldExpoRouter(projectRoot: string, srcDir: string): void {
  const catalogDir = path.join(projectRoot, srcDir, '__dev');
  fs.mkdirSync(catalogDir, { recursive: true });
  const catalogContent = `import { Preflight } from 'react-native-preflight';\n\nexport default function PreflightScreen() {\n  return <Preflight />;\n}\n`;
  const catalogPath = path.join(catalogDir, 'preflight.tsx');
  if (!fs.existsSync(catalogPath)) {
    fs.writeFileSync(catalogPath, catalogContent);
    console.log(`  Created ${srcDir}/__dev/preflight.tsx`);
  }
}

function scaffoldReactNavigation(projectRoot: string, srcDir: string): void {
  const catalogContent = `import { Preflight } from 'react-native-preflight';\n\nexport default function PreflightScreen() {\n  return <Preflight />;\n}\n`;
  const catalogPath = path.join(projectRoot, srcDir, 'PreflightScreen.tsx');
  if (!fs.existsSync(catalogPath)) {
    fs.writeFileSync(catalogPath, catalogContent);
    console.log(`  Created ${srcDir}/PreflightScreen.tsx`);
    console.log('');
    console.log('  Add to your navigator:');
    console.log('    <Stack.Screen name="Preflight" component={PreflightScreen} />');
  }
}

export function runInit(projectRoot: string): void {
  const config = loadConfig(projectRoot);
  const { srcDir, framework } = detectSrcDir(projectRoot, config);

  console.log(`[preflight] Detected: ${frameworkLabel(framework)} (${srcDir}/)`);

  const dirs = [config.screensDir, config.snapshotsDir];
  for (const dir of dirs) {
    const fullPath = path.join(projectRoot, dir);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  Created ${dir}/`);
  }

  const appJsonPath = path.join(projectRoot, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    let appJson: Record<string, any>;
    try {
      appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    } catch {
      console.error('[preflight] Failed to parse app.json');
      process.exit(1);
    }
    const existing = appJson.expo?.scheme;
    if (typeof existing === 'string' && existing !== 'preflight') {
      appJson.expo.scheme = [existing, 'preflight'];
    } else if (typeof existing === 'string') {
      // Already "preflight", nothing to do
    } else if (Array.isArray(existing)) {
      if (!existing.includes('preflight')) {
        existing.push('preflight');
      }
    } else {
      appJson.expo = appJson.expo ?? {};
      appJson.expo.scheme = 'preflight';
    }
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
    console.log('  Added "preflight" scheme to app.json');
  }

  if (framework === 'expo-router') {
    scaffoldExpoRouter(projectRoot, srcDir);
  } else {
    scaffoldReactNavigation(projectRoot, srcDir);
  }

  const babelConfigPath = path.join(projectRoot, 'babel.config.js');
  if (fs.existsSync(babelConfigPath)) {
    const content = fs.readFileSync(babelConfigPath, 'utf-8');
    if (!content.includes('react-native-preflight/babel')) {
      const updated = content.replace(
        /plugins\s*:\s*\[/,
        `plugins: [\n      ['react-native-preflight/babel', { strip: process.env.NODE_ENV === 'production' }],`,
      );
      if (updated !== content) {
        fs.writeFileSync(babelConfigPath, updated);
        console.log('  Added babel plugin to babel.config.js');
      } else {
        console.log('  Note: Could not auto-add babel plugin. Add manually:');
        console.log("    ['react-native-preflight/babel', { strip: process.env.NODE_ENV === 'production' }]");
      }
    }
  }

  console.log('\nReady! Wrap your screens with scenario() and run: npx preflight test');
}

function frameworkLabel(framework: Framework): string {
  switch (framework) {
    case 'expo-router':
      return 'Expo Router';
    case 'react-navigation':
      return 'React Navigation';
    default:
      return 'Unknown framework';
  }
}
