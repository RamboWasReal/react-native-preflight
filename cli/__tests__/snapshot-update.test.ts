import { runSnapshotUpdate } from '../commands/snapshot-update';
import * as fs from 'fs';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

const config = {
  appId: 'com.test',
  scheme: 'preflight',
  screensDir: '.maestro/screens',
  snapshotsDir: '.maestro/snapshots',
  threshold: 0.1,
  srcDir: '',
};

let mockExit: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockExit = jest
    .spyOn(process, 'exit')
    .mockImplementation((() => {
      throw new Error('exit');
    }) as any);
});

afterEach(() => {
  mockExit.mockRestore();
});

test('exits when snapshotsDir does not exist', () => {
  const error = jest.spyOn(console, 'error').mockImplementation();
  mockFs.existsSync.mockReturnValue(false);

  expect(() => runSnapshotUpdate(undefined, '/project', config)).toThrow('exit');

  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('No snapshots directory')
  );
  expect(mockExit).toHaveBeenCalledWith(1);
  error.mockRestore();
});

test('updates baseline for specific scenario', () => {
  mockFs.existsSync.mockImplementation((p) => {
    if (String(p).includes('diff.png')) return true;
    return true;
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  runSnapshotUpdate('counter', '/project', config);

  expect(mockFs.copyFileSync).toHaveBeenCalledWith(
    expect.stringContaining('counter/current.png'),
    expect.stringContaining('counter/baseline.png')
  );
  expect(mockFs.unlinkSync).toHaveBeenCalledWith(
    expect.stringContaining('diff.png')
  );
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Updated counter'));
  log.mockRestore();
});

test('skips scenario without current screenshot', () => {
  mockFs.existsSync.mockImplementation((p) => {
    if (String(p).includes('current.png')) return false;
    return true;
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  runSnapshotUpdate('missing', '/project', config);

  expect(mockFs.copyFileSync).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
  log.mockRestore();
});

test('updates all scenarios when no id given', () => {
  mockFs.existsSync.mockImplementation((p) => {
    if (String(p).includes('diff.png')) return false;
    return true;
  });
  (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
    const dirStr = String(dir);
    if (dirStr.endsWith('snapshots')) {
      return [
        { name: 'counter', isDirectory: () => true, isFile: () => false },
        { name: 'profile', isDirectory: () => true, isFile: () => false },
      ];
    }
    // Leaf dirs
    return [
      { name: 'baseline.png', isDirectory: () => false, isFile: () => true },
      { name: 'current.png', isDirectory: () => false, isFile: () => true },
    ];
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  runSnapshotUpdate(undefined, '/project', config);

  expect(mockFs.copyFileSync).toHaveBeenCalledTimes(2);
  log.mockRestore();
});
