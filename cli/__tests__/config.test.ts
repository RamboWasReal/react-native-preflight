import { loadConfig, detectSrcDir } from '../config';
import type { PreflightConfig } from '../config';
import * as fs from 'fs';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
  jest.clearAllMocks();
});

test('loads config from package.json preflight key', () => {
  const pkg = {
    preflight: {
      appId: 'com.test.app',
      scheme: 'preflight',
      screensDir: '.maestro/screens',
      snapshotsDir: '.maestro/snapshots',
      threshold: 0.1,
    },
  };
  (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
    !String(p).includes('preflight.config.js')
  );
  (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(pkg));

  const config = loadConfig('/fake/project');
  expect(config.appId).toBe('com.test.app');
  expect(config.threshold).toBe(0.1);
});

test('uses defaults when preflight key is missing', () => {
  (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
    !String(p).includes('preflight.config.js')
  );
  (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));

  const config = loadConfig('/fake/project');
  expect(config.scheme).toBe('preflight');
  expect(config.screensDir).toBe('.maestro/screens');
  expect(config.snapshotsDir).toBe('.maestro/snapshots');
  expect(config.threshold).toBe(0.1);
  expect(config.srcDir).toBe('');
});

test('returns defaults when package.json is malformed', () => {
  const error = jest.spyOn(console, 'error').mockImplementation();
  (fs.existsSync as jest.Mock).mockImplementation((p: unknown) =>
    !String(p).includes('preflight.config.js')
  );
  (fs.readFileSync as jest.Mock).mockReturnValue('NOT VALID JSON{{{');

  const config = loadConfig('/fake/project');
  expect(config.scheme).toBe('preflight');
  expect(config.threshold).toBe(0.1);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
  error.mockRestore();
});

test('loads srcDir from config', () => {
  const pkg = {
    preflight: {
      appId: 'com.test.app',
      srcDir: 'src/app',
    },
  };
  mockFs.existsSync.mockImplementation((p: unknown) =>
    !String(p).includes('preflight.config.js')
  );
  mockFs.readFileSync.mockReturnValue(JSON.stringify(pkg));

  const config = loadConfig('/fake/project');
  expect(config.srcDir).toBe('src/app');
});

describe('detectSrcDir', () => {
  const defaults: PreflightConfig = {
    appId: '',
    scheme: 'preflight',
    screensDir: '.maestro/screens',
    snapshotsDir: '.maestro/snapshots',
    threshold: 0.1,
    srcDir: '',
  };

  test('uses explicit srcDir from config', () => {
    mockFs.existsSync.mockReturnValue(true);
    const result = detectSrcDir('/project', { ...defaults, srcDir: 'custom/dir' });
    expect(result.srcDir).toBe('custom/dir');
  });

  test('errors when explicit srcDir does not exist', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const mockError = jest.spyOn(console, 'error').mockImplementation();
    mockFs.existsSync.mockReturnValue(false);

    expect(() => detectSrcDir('/project', { ...defaults, srcDir: 'nonexistent' })).toThrow('exit');
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  test('detects app/ with _layout.tsx as expo-router', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const s = String(p);
      return s.endsWith('/app') || s.endsWith('/_layout.tsx');
    });

    const result = detectSrcDir('/project', defaults);
    expect(result).toEqual({ srcDir: 'app', framework: 'expo-router' });
  });

  test('detects src/app/ with _layout.tsx as expo-router', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const s = String(p);
      // app/ exists but no layout, src/app/ exists with layout
      if (s === '/project/app') return true;
      if (s.includes('/project/app/_layout')) return false;
      if (s === '/project/src/app') return true;
      if (s.includes('/project/src/app/_layout.tsx')) return true;
      return false;
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const result = detectSrcDir('/project', defaults);
    expect(result).toEqual({ srcDir: 'src/app', framework: 'expo-router' });
    logSpy.mockRestore();
  });

  test('detects src/screens/ as react-navigation', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const s = String(p);
      return s === '/project/src/screens';
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const result = detectSrcDir('/project', defaults);
    expect(result).toEqual({ srcDir: 'src/screens', framework: 'react-navigation' });
    logSpy.mockRestore();
  });

  test('falls back to src/ as unknown', () => {
    mockFs.existsSync.mockImplementation((p) => {
      return String(p) === '/project/src';
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const result = detectSrcDir('/project', defaults);
    expect(result).toEqual({ srcDir: 'src', framework: 'unknown' });
    logSpy.mockRestore();
  });

  test('errors when no directory found', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const mockError = jest.spyOn(console, 'error').mockImplementation();
    mockFs.existsSync.mockReturnValue(false);

    expect(() => detectSrcDir('/project', defaults)).toThrow('exit');
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('No app/'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
