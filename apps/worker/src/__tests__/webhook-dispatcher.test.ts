import { describe, expect, it } from 'vitest';
import { calculateBackoffMs, isRetryableHttpStatus } from '../webhook-dispatcher.js';

describe('webhook retry policy', () => {
  it('increases the delay with each attempt and caps it at one hour', () => {
    const delays = [1, 2, 3, 4, 5, 9].map(calculateBackoffMs);

    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays[0]).toBe(5_000);
    expect(delays.at(-1)).toBe(60 * 60 * 1000);
  });

  it.each([408, 429, 500, 502, 503, 504])('retries HTTP %i', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 410, 422])('does not retry HTTP %i', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(false);
  });
});
