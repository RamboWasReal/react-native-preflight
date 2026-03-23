import { runInit } from '../commands/init';
import * as fs from 'fs';
import * as config from '../config';

jest.mock('fs');
jest.mock('../config');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockConfig = config as jest.Mocked<typeof config>;

const defaults: config.PreflightConfig = {
  appId: '',
  scheme: 'preflight',
  screensDir: '.maestro/screens',
  snapshotsDir: '.maestro/snapshots',
  threshold: 0.1,
  srcDir: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.loadConfig.mockReturnValue(defaults);
  mockFs.mkdirSync.mockReturnValue(undefined);
  mockFs.writeFileSync.mockReturnValue(undefined);
});

test('creates .maestro/screens directory with expo-router', () => {
  mockConfig.detectSrcDir.mockReturnValue({ srcDir: 'app', framework: 'expo-router' });
  mockFs.existsSync.mockImplementation((p) => String(p).includes('app.json'));
  mockFs.readFileSync.mockReturnValue(JSON.stringify({ expo: { scheme: 'myapp' } }));

  runInit('/fake/project');

  expect(mockFs.mkdirSync).toHaveBeenCalledWith(
    expect.stringContaining('.maestro/screens'),
    expect.anything()
  );
});

test('adds preflight scheme to app.json', () => {
  mockConfig.detectSrcDir.mockReturnValue({ srcDir: 'app', framework: 'expo-router' });
  mockFs.existsSync.mockImplementation((p) => String(p).includes('app.json'));
  mockFs.readFileSync.mockReturnValue(JSON.stringify({ expo: { scheme: 'myapp' } }));

  runInit('/fake/project');

  const writeCall = mockFs.writeFileSync.mock.calls.find(
    (call) => String(call[0]).includes('app.json')
  );
  expect(writeCall).toBeDefined();
  const written = JSON.parse(writeCall![1] as string);
  expect(written.expo.scheme).toContain('preflight');
});

test('scaffolds __dev/preflight.tsx for expo-router', () => {
  mockConfig.detectSrcDir.mockReturnValue({ srcDir: 'app', framework: 'expo-router' });
  mockFs.existsSync.mockReturnValue(false);
  mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

  runInit('/fake/project');

  const writeCall = mockFs.writeFileSync.mock.calls.find(
    (call) => String(call[0]).includes('__dev/preflight.tsx')
  );
  expect(writeCall).toBeDefined();
  expect(String(writeCall![0])).toContain('app/__dev/preflight.tsx');
});

test('scaffolds __dev/preflight.tsx in src/app for expo-router', () => {
  mockConfig.detectSrcDir.mockReturnValue({ srcDir: 'src/app', framework: 'expo-router' });
  mockFs.existsSync.mockReturnValue(false);
  mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

  runInit('/fake/project');

  const writeCall = mockFs.writeFileSync.mock.calls.find(
    (call) => String(call[0]).includes('__dev/preflight.tsx')
  );
  expect(writeCall).toBeDefined();
  expect(String(writeCall![0])).toContain('src/app/__dev/preflight.tsx');
});

test('scaffolds PreflightScreen.tsx for react-navigation', () => {
  mockConfig.detectSrcDir.mockReturnValue({ srcDir: 'src/screens', framework: 'react-navigation' });
  mockFs.existsSync.mockReturnValue(false);
  mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

  const logSpy = jest.spyOn(console, 'log').mockImplementation();

  runInit('/fake/project');

  const writeCall = mockFs.writeFileSync.mock.calls.find(
    (call) => String(call[0]).includes('PreflightScreen.tsx')
  );
  expect(writeCall).toBeDefined();
  expect(String(writeCall![0])).toContain('src/screens/PreflightScreen.tsx');

  // Should log navigator instructions
  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Stack.Screen'));

  logSpy.mockRestore();
});
