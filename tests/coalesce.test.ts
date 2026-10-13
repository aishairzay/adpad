import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce } from '../src/lib/coalesce';

describe('coalesce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs a burst of calls once', async () => {
    const run = vi.fn(async () => {});
    const call = coalesce(run, 400);
    for (let i = 0; i < 9; i++) call();
    await vi.advanceTimersByTimeAsync(399);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never overlaps runs and runs once more after calls during a run', async () => {
    let finish: () => void = () => {};
    let active = 0; let maxActive = 0;
    const run = vi.fn(() => new Promise<void>(resolve => { active++; maxActive = Math.max(maxActive, active); finish = () => { active--; resolve(); }; }));
    const call = coalesce(run, 100);
    call();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    call(); call(); call();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it('does nothing after cancel', async () => {
    const run = vi.fn(async () => {});
    const call = coalesce(run, 100);
    call(); call.cancel(); call();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps going after a failed run', async () => {
    const run = vi.fn(async () => { throw new Error('offline'); });
    const call = coalesce(run, 50);
    call();
    await vi.advanceTimersByTimeAsync(50);
    call();
    await vi.advanceTimersByTimeAsync(50);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
