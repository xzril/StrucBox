import { expect, it } from 'vitest';
import { otsu } from './preprocess';

it('otsu splits a two-level histogram between the peaks', () => {
  const hist = new Array(256).fill(0);
  hist[40] = 500; // ink
  hist[210] = 2000; // paper
  const t = otsu(hist);
  expect(t).toBeGreaterThanOrEqual(40);
  expect(t).toBeLessThan(210);
});

it('cleanOcrText fixes symbol-for-letter confusions', async () => {
  const { cleanOcrText } = await import('./preprocess');
  expect(cleanOcrText('pin a1 ©, load 1,200 N')).toBe('pin at O, load 1200 N');
});
