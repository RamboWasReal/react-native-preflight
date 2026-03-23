import { runSnapshotCompare } from '../commands/snapshot-compare';
import * as fs from 'fs';
import { compareImages } from '../snapshot/compare';
import { generateReport } from '../snapshot/report';

jest.mock('fs');
jest.mock('../snapshot/compare');
jest.mock('../snapshot/report');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockCompare = compareImages as jest.MockedFunction<typeof compareImages>;
const mockReport = generateReport as jest.MockedFunction<typeof generateReport>;

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

function mockSnapshotDir(scenarios: string[]) {
  // Root level: directories for each scenario
  (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
    const dirStr = String(dir);
    if (dirStr.endsWith('snapshots')) {
      return scenarios.map((name) => ({
        name,
        isDirectory: () => true,
        isFile: () => false,
      }));
    }
    // Leaf dirs contain png files
    return [
      { name: 'baseline.png', isDirectory: () => false, isFile: () => true },
      { name: 'current.png', isDirectory: () => false, isFile: () => true },
    ];
  });
}

test('exits when snapshotsDir does not exist', () => {
  mockFs.existsSync.mockReturnValue(false);
  expect(() => runSnapshotCompare({}, '/project', config)).toThrow('exit');
  expect(mockExit).toHaveBeenCalledWith(1);
});

test('exits with invalid threshold', () => {
  mockFs.existsSync.mockReturnValue(true);
  expect(() =>
    runSnapshotCompare({ threshold: 'abc' }, '/project', config)
  ).toThrow('exit');
  expect(mockExit).toHaveBeenCalledWith(1);
});

test('compares scenarios and generates report', () => {
  mockFs.existsSync.mockReturnValue(true);
  mockSnapshotDir(['counter']);
  mockFs.readFileSync.mockReturnValue(Buffer.from('fake-png'));
  mockCompare.mockReturnValue({
    diffPercentage: 0.05,
    diffPixels: 10,
    totalPixels: 10000,
    diffPng: null,
  });

  const log = jest.spyOn(console, 'log').mockImplementation();
  runSnapshotCompare({}, '/project', config);

  expect(mockCompare).toHaveBeenCalled();
  expect(mockReport).toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('PASS'));
  log.mockRestore();
});

test('reports failure and exits in CI mode', () => {
  mockFs.existsSync.mockReturnValue(true);
  mockSnapshotDir(['counter']);
  mockFs.readFileSync.mockReturnValue(Buffer.from('fake-png'));
  mockCompare.mockReturnValue({
    diffPercentage: 5.0,
    diffPixels: 500,
    totalPixels: 10000,
    diffPng: Buffer.from('diff'),
  });
  mockFs.writeFileSync.mockReturnValue(undefined);

  const log = jest.spyOn(console, 'log').mockImplementation();

  expect(() => runSnapshotCompare({ ci: true }, '/project', config)).toThrow(
    'exit'
  );
  expect(log).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
  expect(mockExit).toHaveBeenCalledWith(1);

  log.mockRestore();
});

test('skips scenarios missing baseline or current', () => {
  mockFs.existsSync.mockImplementation((p) => {
    if (String(p).includes('baseline.png')) return false;
    return true;
  });
  mockSnapshotDir(['counter']);

  const log = jest.spyOn(console, 'log').mockImplementation();
  runSnapshotCompare({}, '/project', config);

  expect(mockCompare).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
  log.mockRestore();
});
