import { compareImages } from '../snapshot/compare';
import { PNG } from 'pngjs';

test('identical images return 0% diff', () => {
  const img = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = 255;
  }
  const buffer = PNG.sync.write(img);
  const result = compareImages(buffer, buffer);
  expect(result.diffPercentage).toBe(0);
});

test('different images return > 0% diff', () => {
  const img1 = new PNG({ width: 10, height: 10 });
  const img2 = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < img1.data.length; i += 4) {
    img1.data[i] = 255; img1.data[i+1] = 0; img1.data[i+2] = 0; img1.data[i+3] = 255;
    img2.data[i] = 0; img2.data[i+1] = 255; img2.data[i+2] = 0; img2.data[i+3] = 255;
  }
  const buf1 = PNG.sync.write(img1);
  const buf2 = PNG.sync.write(img2);
  const result = compareImages(buf1, buf2);
  expect(result.diffPercentage).toBeGreaterThan(0);
  expect(result.diffPng).toBeDefined();
});
