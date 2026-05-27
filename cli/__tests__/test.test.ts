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

function createMockProcess(output: string, exitCode: number, stderr = '') {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: jest.fn(), end: jest.fn() };

  // Emit output and close on next tick
  process.nextTick(() => {
    if (output) proc.stdout.emit('data', Buffer.from(output));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
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
  mockFs.readFileSync.mockReturnValue(`---
- openLink:
    link: "preflight://scenario/counter"
- assertVisible:
    id: "counter"
`);
  mockFs.writeFileSync.mockReturnValue(undefined);
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
  mockFs.existsSync.mockImplementation((filePath) => !String(filePath).includes('/.maestro/flows'));
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockFs.readdirSync as jest.Mock).mockReturnValue([
    { name: 'a.yaml', isDirectory: () => false, isFile: () => true },
    { name: 'b.yaml', isDirectory: () => false, isFile: () => true },
  ]);
  (mockSpawn as any).mockImplementation((_cmd: string, args: string[]) => {
    const flowPath = args[args.length - 1]!;
    const flowName = flowPath.includes('b.yaml') ? 'b' : 'a';
    return createMockProcess(`[Passed] ${flowName} (2s)\n`, 0);
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest(undefined, { all: true }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledTimes(2);
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

test('prints raw maestro stderr when non-zero output is not parseable', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('', 1, 'Failed to parse flow: mapping values are not allowed here\n'),
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await expect(runTest('counter', {}, '/project', config)).rejects.toThrow('exit');

  expect(log).toHaveBeenCalledWith(expect.stringContaining('Maestro error:'));
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to parse flow'));
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

test('passes --platform ios to maestro when requested', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'ios' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test', '--platform', 'ios']),
    expect.anything()
  );
  log.mockRestore();
});

test('passes --platform android to maestro when requested', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'android' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test', '--platform', 'android']),
    expect.anything()
  );
  log.mockRestore();
});

test('keeps platform and env args when retrying failed tests', async () => {
  const multiConfig = {
    ...config,
    appId: { ios: 'com.test.ios', android: 'com.test.android' } as any,
  };
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any)
    .mockImplementationOnce(() =>
      createMockProcess('[Failed] counter (10s) (Assertion is false: id: counter is visible)\n', 1)
    )
    .mockImplementationOnce(() =>
      createMockProcess('[Passed] counter (3s)\n', 0)
    );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'ios', retry: '1' }, '/project', multiConfig);

  expect(mockSpawn).toHaveBeenCalledTimes(2);
  for (const call of mockSpawn.mock.calls) {
    expect(call[1]).toEqual(expect.arrayContaining(['test', '--platform', 'ios', '-e', 'APP_ID=com.test.ios']));
  }
  log.mockRestore();
});

test('passes --device to maestro when requested', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { device: 'emulator-5554' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test', '--device', 'emulator-5554']),
    expect.anything()
  );
  log.mockRestore();
});

test('passes --udid to maestro as a device selector', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { udid: 'booted-simulator-id' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test', '--device', 'booted-simulator-id']),
    expect.anything()
  );
  log.mockRestore();
});

test('keeps device when retrying failed tests', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any)
    .mockImplementationOnce(() =>
      createMockProcess('[Failed] counter (10s) (Assertion is false: id: counter is visible)\n', 1)
    )
    .mockImplementationOnce(() =>
      createMockProcess('[Passed] counter (3s)\n', 0)
    );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { device: 'emulator-5554', retry: '1' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledTimes(2);
  for (const call of mockSpawn.mock.calls) {
    expect(call[1]).toEqual(expect.arrayContaining(['test', '--device', 'emulator-5554']));
  }
  log.mockRestore();
});

test('passes platform and device to maestro when both are requested', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(
    createMockProcess('[Passed] counter (3s)\n', 0)
  );

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'ios', device: 'booted-simulator-id' }, '/project', config);

  expect(mockSpawn).toHaveBeenCalledWith(
    'maestro',
    expect.arrayContaining(['test', '--platform', 'ios', '--device', 'booted-simulator-id']),
    expect.anything()
  );
  log.mockRestore();
});

const IOS_OPEN_LINK_PROMPT_HANDLER = `platform: iOS
      visible:
        text: "Open in .*"
    commands:
      - tapOn:
          text: "Open"`;

const IOS_DEV_MENU_HANDLER = `platform: iOS
      visible:
        text: "This is the developer menu.*"
    commands:
      - tapOn:
          text: "Continue"`;

function getTempFlowWrittenContent(): string {
  const writeCall = mockFs.writeFileSync.mock.calls.find(
    (call) => typeof call[0] === 'string' && String(call[0]).includes('/tmp/preflight-abc'),
  );
  return writeCall ? String(writeCall[1]) : '';
}

test('iOS temp flow copy injects both overlay handlers after openLink', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(createMockProcess('[Passed] counter (3s)\n', 0));

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'ios' }, '/project', config);

  const written = getTempFlowWrittenContent();
  expect(written).toContain(IOS_OPEN_LINK_PROMPT_HANDLER);
  expect(written).toContain(IOS_DEV_MENU_HANDLER);
  expect(written.indexOf(IOS_OPEN_LINK_PROMPT_HANDLER)).toBeGreaterThan(written.indexOf('openLink'));
  expect(written.indexOf(IOS_DEV_MENU_HANDLER)).toBeGreaterThan(written.indexOf(IOS_OPEN_LINK_PROMPT_HANDLER));
  expect(written).toContain('- assertVisible:');
  expect(mockFs.copyFileSync).not.toHaveBeenCalled();
  log.mockRestore();
});

test('Android temp flow copy is unchanged', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(createMockProcess('[Passed] counter (3s)\n', 0));

  const sourceYaml = `---
- openLink:
    link: "preflight://scenario/counter"
- assertVisible:
    id: "counter"
`;
  mockFs.readFileSync.mockReturnValue(sourceYaml);

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', { platform: 'android' }, '/project', config);

  expect(getTempFlowWrittenContent()).toBe(sourceYaml);
  log.mockRestore();
});

test('temp flow without openLink is unchanged on iOS', async () => {
  const sourceYaml = `---
- launchApp:
    stopApp: false
- assertVisible:
    id: "home"
`;
  mockFs.readFileSync.mockReturnValue(sourceYaml);
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(createMockProcess('[Passed] home (2s)\n', 0));

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('home', { platform: 'ios' }, '/project', config);

  expect(getTempFlowWrittenContent()).toBe(sourceYaml);
  log.mockRestore();
});

test('iOS temp flow injects both handlers after every openLink', async () => {
  const sourceYaml = `---
- openLink:
    link: "preflight://scenario/a"
- openLink:
    link: "preflight://scenario/b"
- assertVisible:
    id: "b"
`;
  mockFs.readFileSync.mockReturnValue(sourceYaml);
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(createMockProcess('[Passed] ab (2s)\n', 0));

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('ab', { platform: 'ios' }, '/project', config);

  const written = getTempFlowWrittenContent();
  expect(written.match(/text: "Open in \.\*"/g)).toHaveLength(2);
  expect(written.match(/text: "This is the developer menu\.\*"/g)).toHaveLength(2);
  expect(written).toContain('- assertVisible:\n    id: "b"');
  log.mockRestore();
});

test('default test run without platform does not inject iOS overlay handlers', async () => {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  (mockSpawn as any).mockReturnValue(createMockProcess('[Passed] counter (3s)\n', 0));

  const sourceYaml = `---
- openLink:
    link: "preflight://scenario/counter"
`;
  mockFs.readFileSync.mockReturnValue(sourceYaml);

  const log = jest.spyOn(console, 'log').mockImplementation();
  await runTest('counter', {}, '/project', config);

  expect(getTempFlowWrittenContent()).toBe(sourceYaml);
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
