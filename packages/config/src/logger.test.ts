import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';

describe('logger', () => {
  let out: string[];
  let err: string[];

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
    process.env['LOG_FORMAT'] = 'json';
    delete process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['LOG_FORMAT'];
    delete process.env['LOG_LEVEL'];
  });

  it('writes one JSON line with the time, level, component and message', () => {
    createLogger('Worker').info('Started', { queue: 'events' });

    const line = JSON.parse(out[0]!);
    expect(line).toMatchObject({ level: 'info', component: 'Worker', msg: 'Started', queue: 'events' });
    expect(new Date(line.time).toString()).not.toBe('Invalid Date');
    expect(out[0]!.endsWith('\n')).toBe(true);
  });

  it('sends warnings and errors to stderr', () => {
    const log = createLogger('Worker');
    log.warn('Careful');
    log.error('Broken');

    expect(out).toEqual([]);
    expect(err.map((line) => JSON.parse(line).level)).toEqual(['warn', 'error']);
  });

  it('turns an error into fields with its message and stack', () => {
    createLogger('Worker').error('Job failed', new Error('boom'));

    const line = JSON.parse(err[0]!);
    expect(line.err).toMatchObject({ name: 'Error', message: 'boom' });
    expect(line.err.stack).toContain('boom');
  });

  it('keeps plain values under detail', () => {
    createLogger('Worker').error('Failed', 'connection refused');
    expect(JSON.parse(err[0]!).detail).toBe('connection refused');
  });

  it('adds child fields to every line, and lets a line add its own', () => {
    const log = createLogger('Processor').child({ eventId: 'evt_1', projectId: 'prj_1' });
    log.info('Processing', { rules: 3 });

    expect(JSON.parse(out[0]!)).toMatchObject({ eventId: 'evt_1', projectId: 'prj_1', rules: 3 });
  });

  it('never logs secrets', () => {
    createLogger('Auth').info('Signing in', { email: 'a@example.com', password: 'hunter2', apiKey: 'gami_live_x' });

    const text = out[0]!;
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('gami_live_x');
    expect(text).toContain('a@example.com');
  });

  it('respects LOG_LEVEL', () => {
    process.env['LOG_LEVEL'] = 'warn';
    const log = createLogger('Worker');
    log.debug('quiet');
    log.info('quiet');
    log.warn('loud');

    expect(out).toEqual([]);
    expect(err).toHaveLength(1);
  });

  it('survives circular data and bigint', () => {
    const loop: Record<string, unknown> = { id: 1n };
    loop['self'] = loop;

    expect(() => createLogger('Worker').info('Odd data', loop)).not.toThrow();
    expect(out[0]).toContain('[Circular]');
  });

  it('writes readable text outside production', () => {
    process.env['LOG_FORMAT'] = 'text';
    createLogger('Worker').info('Started', { queue: 'events' });

    expect(out[0]).toMatch(/INFO\s+\[Worker\] Started \{"queue":"events"\}/);
  });
});
