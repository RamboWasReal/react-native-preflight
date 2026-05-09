import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, detectSrcDir } from '../config';
import type { Framework } from '../config';

const BABEL_PLUGIN = "['react-native-preflight/babel', { strip: process.env.NODE_ENV === 'production' }]";

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

function addBabelPlugin(content: string): string | null {
  if (content.includes('react-native-preflight/babel')) return content;

  const withExistingPlugins = content.replace(
    /plugins\s*:\s*\[/,
    `plugins: [\n      ${BABEL_PLUGIN},`,
  );
  if (withExistingPlugins !== content) return withExistingPlugins;

  const moduleObject = content.replace(
    /module\.exports\s*=\s*\{/,
    `module.exports = {\n  plugins: [\n    ${BABEL_PLUGIN},\n  ],`,
  );
  if (moduleObject !== content) return moduleObject;

  const exportDefaultObject = content.replace(
    /export\s+default\s+\{/,
    `export default {\n  plugins: [\n    ${BABEL_PLUGIN},\n  ],`,
  );
  if (exportDefaultObject !== content) return exportDefaultObject;

  return null;
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
    appJson.expo = appJson.expo ?? {};
    const existing = appJson.expo.scheme;
    let schemeChanged = false;
    if (typeof existing === 'string' && existing !== config.scheme) {
      appJson.expo.scheme = [existing, config.scheme];
      schemeChanged = true;
    } else if (typeof existing === 'string') {
      // Already configured, nothing to do
    } else if (Array.isArray(existing)) {
      if (!existing.includes(config.scheme)) {
        existing.push(config.scheme);
        schemeChanged = true;
      }
    } else {
      appJson.expo.scheme = config.scheme;
      schemeChanged = true;
    }
    if (schemeChanged) {
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
      console.log(`  Added "${config.scheme}" scheme to app.json`);
    } else {
      console.log(`  Scheme "${config.scheme}" already configured in app.json`);
    }
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
      const updated = addBabelPlugin(content);
      if (updated) {
        fs.writeFileSync(babelConfigPath, updated);
        console.log('  Added babel plugin to babel.config.js');
      } else {
        console.log('  Note: Could not auto-add babel plugin. Add manually:');
        console.log(`    ${BABEL_PLUGIN}`);
      }
    } else {
      console.log('  Babel plugin already configured');
    }
  } else {
    console.log('  Note: No babel.config.js found. Add this plugin manually when your app uses Babel:');
    console.log(`    ${BABEL_PLUGIN}`);
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
