import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PadGestures } from '../src/midi/pad-gestures';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('toque corto: tap y release', () => {
  const log: string[] = [];
  const g = new PadGestures((pad, ev) => log.push(`${pad}:${ev}`));
  g.down(2);
  vi.advanceTimersByTime(200);
  g.up(2);
  vi.advanceTimersByTime(2000);
  expect(log).toEqual(['2:tap', '2:release']);
});

test('mantener 1 s: tap y luego hold', () => {
  const log: string[] = [];
  const g = new PadGestures((pad, ev) => log.push(`${pad}:${ev}`));
  g.down(0);
  vi.advanceTimersByTime(999);
  expect(log).toEqual(['0:tap']);
  vi.advanceTimersByTime(1);
  expect(log).toEqual(['0:tap', '0:hold']);
});

test('up sin down no emite nada', () => {
  const log: string[] = [];
  const g = new PadGestures((pad, ev) => log.push(`${pad}:${ev}`));
  g.up(1);
  expect(log).toEqual([]);
});
