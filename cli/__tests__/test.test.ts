import { runTest } from '../commands/test';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import prompts from 'prompts';

jest.mock('fs');
jest.mock('os');
jest.mock('child_process');
jest.mock('prompts');
jest.mock('../commands/generate');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockPrompts = prompts as unknown as jest.MockedFunction<typeof prompts>;

const config = {
  appId: 'com.test',
  scheme: 'preflight',
  screensDir: '.maestro/screens',
  snapshotsDir: '.maestro/snapshots',
  threshold: 0.1,
  srcDir: '',
};

function createMockProcess(output: string, exitCode: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: jest.fn(), end: jest.fn() };

  // Emit output and close on next tick
  process.nextTick(() => {
    proc.stdout.emit('data', Buffer.from(output));
    proc.emit('close', exitCode);
  });

  return proc;
}

let mockExit: jest.SpyInstance;
let mockStdoutWrite: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockExit = jest
    .spyOn(process, 'exit')
    .mockImplementation((() => {
      throw new Error('exit');
    }) as any);
  mockStdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockOs.tmpdir.mockReturnValue('/tmp');
  mockFs.mkdtempSync.mockReturnValue('/tmp/preflight-abc');
  mockFs.rmSync.mockReturnValue(undefined);
  mockFs.copyFileSync.mockReturnValue(undefined);
});

afterEach(() => {
  mockExit.mockRestore();
  mockStdoutWrite.mockRestore();
});

test('exits with error when invalid scenario id', async () => {
  mockFs.existsSync.mockReturnValue(true);
  await expect(runTest('invalid id', {}, '/project', config)).rejects.toThrow('exit');
  expect(mockExit).toHaveBeenCalledWith(1);
});

test('runs maestro for a single scenario', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', {}, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test']),
    expect.anything()
  );
  log.mockRestore();
});

test('runs all yaml files when --all', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockFs.readdirSync as jest.Mock).mockReturnValue([
    { name: 'a.yaml', isDirectory: () => false, isFile: () => true },
    { name: 'b.yaml', isDirectory: () => false, isFile: () => true },
  ]);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] a (2s)\n[Passed] b (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest(undefined, { all: true }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

test('reports failure when maestro exits non-zero', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Failed] counter (10s) (Assertion is false: id: counter is visible)\n', 1)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await expect(runTest('counter', {}, '/project', config)).rejects.toThrow('exit');
  expect(mockExit).toHaveBeenCalledWith(1);
  log.mockRestore();
});

test('cleans up temp dir after tests', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (2s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', {}, '/project', config);

  expect(mockFs.rmSync).toHaveBeenCalledWith('/tmp/preflight-abc', { recursive: true, force: true });
  log.mockRestore();
});

test('shows interactive picker when no id and no --all', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockFs.readdirSync as jest.Mock).mockReturnValue([
    { name: 'home.yaml', isDirectory: () => false, isFile: () => true },
  ]);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] home (2s)\n', 0)
  );
  (mockPrompts as any).mockResolvedValue({
    scenarios: ['/project/.maestro/screens/home.yaml'],
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest(undefined, {}, '/project', config);

  expect(mockPrompts).toHaveBeenCalled();
  log.mockRestore();
});

test('passes -e APP_ID to maestro when multi-platform appId with --platform', async () => {
  const multiConfig = {
    ...config,
    appId: { ios: 'com.test.ios', android: 'com.test.android' } as any,
  };
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'ios' as const }, '/project', multiConfig);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['-e', 'APP_ID=com.test.ios']),
    expect.anything()
  );
  log.mockRestore();
});

test('exits with error when multi-platform appId without --platform', async () => {
  const multiConfig = {
    ...config,
    appId: { ios: 'com.test.ios', android: 'com.test.android' } as any,
  };
  mockFs.existsSync.mockReturnValue(true);

  const errLog = jest.spyOn(console, 'error').mockImplementation();
  await expect(runTest('counter', {}, '/project', multiConfig)).rejects.toThrow('exit');
  expect(mockExit).toHaveBeenCalledWith(1);
  expect(errLog).toHaveBeenCalledWith(expect.stringContaining('--platform'));
  errLog.mockRestore();
});
