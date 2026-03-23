import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface CompareResult {
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  diffPng: Buffer | null;
}

export function compareImages(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
): CompareResult {
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.warn(`[preflight] Image dimensions differ: baseline ${baseline.width}x${baseline.height} vs current ${current.width}x${current.height}`);
    return {
      diffPercentage: 100,
      diffPixels: baseline.width * baseline.height,
      totalPixels: baseline.width * baseline.height,
      diffPng: null,
    };
  }

  const { width, height } = baseline;
  const totalPixels = width * height;
  const diff = new PNG({ width, height });

  // pixelmatch threshold is per-pixel color sensitivity (0-1), NOT the diff % threshold
  const diffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );

  const diffPercentage = (diffPixels / totalPixels) * 100;

  return {
    diffPercentage,
    diffPixels,
    totalPixels,
    diffPng: diffPixels > 0 ? PNG.sync.write(diff) : null,
  };
}
