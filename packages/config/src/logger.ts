import { redactSensitiveData } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, ...details: unknown[]): void;
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
  /** A logger that adds the same fields to every line, such as an event ID. */
  child(fields: LogFields): Logger;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = (): number => {
  const level = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase() as LogLevel;
  return LEVELS[level] ?? LEVELS.info;
};

/** JSON lines in production, which log tools can read, and plain text on a developer's screen. */
const useJson = (): boolean =>
  process.env['LOG_FORMAT'] === 'json' ||
  (process.env['LOG_FORMAT'] !== 'text' && process.env['NODE_ENV'] === 'production');

function errorFields(error: Error): LogFields {
  return { name: error.name, message: error.message, stack: error.stack };
}

const MAX_DEPTH = 6;

/** Copies data without loops, bigint or very deep nesting, so logging can never throw. */
function plain(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return errorFields(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';

  seen.add(value);
  const copy = Array.isArray(value)
    ? value.map((item) => plain(item, seen, depth + 1))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, plain(item, seen, depth + 1)])
      );
  seen.delete(value);
  return copy;
}

/** Anything passed after the message becomes fields: errors, objects, or a plain value. */
function toFields(details: unknown[]): LogFields {
  const fields: LogFields = {};
  const extras: unknown[] = [];

  for (const detail of details) {
    if (detail instanceof Error) {
      fields['err'] = detail;
    } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      Object.assign(fields, detail);
    } else if (detail !== undefined) {
      extras.push(detail);
    }
  }
  if (extras.length > 0) fields['detail'] = extras.length === 1 ? extras[0] : extras;
  return redactSensitiveData(plain(fields) as LogFields);
}

function write(level: LogLevel, component: string, base: LogFields, message: string, details: unknown[]) {
  if (LEVELS[level] < threshold()) return;

  const fields = { ...base, ...toFields(details) };
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;

  if (useJson()) {
    const line = {
      time: new Date().toISOString(),
      level,
      component,
      msg: message,
      ...fields,
    };
    stream.write(`${safeStringify(line)}\n`);
    return;
  }

  const extra = Object.keys(fields).length > 0 ? ` ${safeStringify(fields)}` : '';
  stream.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${component}] ${message}${extra}\n`);
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
    }
    return item;
  });
}

/**
 * Creates a logger for one part of the system. Output is JSON lines in production, with `time`,
 * `level`, `component` and `msg`, plus any fields you add. Set `LOG_LEVEL` to `debug`, `info`,
 * `warn` or `error`, and `LOG_FORMAT` to `json` or `text` to override the defaults.
 */
export function createLogger(component: string, base: LogFields = {}): Logger {
  return {
    debug: (message, ...details) => write('debug', component, base, message, details),
    info: (message, ...details) => write('info', component, base, message, details),
    warn: (message, ...details) => write('warn', component, base, message, details),
    error: (message, ...details) => write('error', component, base, message, details),
    child: (fields) => createLogger(component, { ...base, ...fields }),
  };
}
