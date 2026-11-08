/**
 * A small, safe JSONLogic (https://jsonlogic.com) evaluator for rule conditions that the builder
 * cannot express, such as `payload.price * payload.quantity > 100`.
 *
 * It only reads the event: there are no loops over user code, no functions, no property writes,
 * and no access to anything but the data passed in. Size and depth are capped when a rule is saved.
 */

export type LogicExpression = unknown;

export const LOGIC_OPERATORS = [
  'var', 'missing', 'if', '==', '===', '!=', '!==', '!', '!!', 'or', 'and',
  '>', '>=', '<', '<=', 'in', 'cat', 'substr', '+', '-', '*', '/', '%', 'min', 'max',
  'some', 'all', 'none', 'lower', 'upper', 'length',
] as const;

export const LOGIC_LIMITS = { MAX_DEPTH: 12, MAX_NODES: 200 } as const;

const OPERATORS = new Set<string>(LOGIC_OPERATORS);
const FORBIDDEN_PATH = /(^|\.)(__proto__|prototype|constructor)(\.|$)/;

function isOperation(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1;
}

/** Truthiness as JSONLogic defines it: an empty list is false. */
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function readVar(data: unknown, path: unknown, fallback: unknown): unknown {
  if (path === null || path === undefined || path === '') return data;
  const text = String(path);
  if (FORBIDDEN_PATH.test(text)) return fallback;
  let current: unknown = data;
  for (const part of text.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return fallback;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  return current === undefined ? fallback : current;
}

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value));

/** Numbers compare as numbers, and two pieces of text (such as ISO dates) compare as text. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string' && (Number.isNaN(Number(a)) || Number.isNaN(Number(b)) || a.trim() === '' || b.trim() === '')) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  return x - y;
}

// Loose equality as JSONLogic uses it, without JavaScript's object coercion surprises.
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a == b;
  if (typeof a === 'object' || typeof b === 'object') return false;
  return a == b;
}

/** Evaluates an expression against data. Unknown operators throw, so a mistake never passes quietly. */
export function applyLogic(logic: LogicExpression, data: unknown): unknown {
  if (Array.isArray(logic)) return logic.map((item) => applyLogic(item, data));
  if (!isOperation(logic)) return logic;

  const op = Object.keys(logic)[0]!;
  if (!OPERATORS.has(op)) throw new Error(`Unsupported logic operator: ${op}`);
  const raw = logic[op];
  const args = Array.isArray(raw) ? raw : [raw];

  // Operators that decide which arguments to evaluate.
  switch (op) {
    case 'if': {
      let i = 0;
      for (; i + 1 < args.length; i += 2) {
        if (truthy(applyLogic(args[i], data))) return applyLogic(args[i + 1], data);
      }
      return i < args.length ? applyLogic(args[i], data) : null;
    }
    case 'or': {
      let last: unknown = false;
      for (const arg of args) {
        last = applyLogic(arg, data);
        if (truthy(last)) return last;
      }
      return last;
    }
    case 'and': {
      let last: unknown = true;
      for (const arg of args) {
        last = applyLogic(arg, data);
        if (!truthy(last)) return last;
      }
      return last;
    }
    case 'some':
    case 'all':
    case 'none': {
      const list = applyLogic(args[0], data);
      if (!Array.isArray(list)) return op === 'none';
      const test = (item: unknown) => truthy(applyLogic(args[1], item));
      if (op === 'some') return list.some(test);
      if (op === 'none') return !list.some(test);
      return list.length > 0 && list.every(test);
    }
  }

  const values = args.map((arg) => applyLogic(arg, data));
  const [a, b, c] = values;

  switch (op) {
    case 'var':
      return readVar(data, a, b ?? null);
    case 'missing':
      return values.filter((key) => readVar(data, key, undefined) === undefined || readVar(data, key, undefined) === null);
    case '==':
      return looseEquals(a, b);
    case '===':
      return a === b;
    case '!=':
      return !looseEquals(a, b);
    case '!==':
      return a !== b;
    case '!':
      return !truthy(a);
    case '!!':
      return truthy(a);
    case '>':
      return compare(a, b) > 0;
    case '>=':
      return compare(a, b) >= 0;
    case '<':
      // `{"<": [1, x, 10]}` reads "x is between 1 and 10".
      return values.length === 3 ? compare(a, b) < 0 && compare(b, c) < 0 : compare(a, b) < 0;
    case '<=':
      return values.length === 3 ? compare(a, b) <= 0 && compare(b, c) <= 0 : compare(a, b) <= 0;
    case 'in':
      if (Array.isArray(b)) return b.some((item) => looseEquals(item, a));
      if (typeof b === 'string') return b.includes(String(a));
      return false;
    case 'cat':
      return values.map((value) => (value === null || value === undefined ? '' : String(value))).join('');
    case 'substr': {
      const text = String(a ?? '');
      const start = toNumber(b) || 0;
      const from = start < 0 ? Math.max(0, text.length + start) : start;
      if (c === undefined) return text.slice(from);
      const length = toNumber(c);
      return length < 0 ? text.slice(from, text.length + length) : text.slice(from, from + length);
    }
    case '+':
      return values.reduce<number>((sum, value) => sum + toNumber(value), 0);
    case '*':
      return values.reduce<number>((product, value) => product * toNumber(value), 1);
    case '-':
      return values.length === 1 ? -toNumber(a) : toNumber(a) - toNumber(b);
    case '/':
      return toNumber(b) === 0 ? null : toNumber(a) / toNumber(b);
    case '%':
      return toNumber(b) === 0 ? null : toNumber(a) % toNumber(b);
    case 'min':
      return values.length ? Math.min(...values.map(toNumber)) : null;
    case 'max':
      return values.length ? Math.max(...values.map(toNumber)) : null;
    case 'lower':
      return typeof a === 'string' ? a.toLowerCase() : a;
    case 'upper':
      return typeof a === 'string' ? a.toUpperCase() : a;
    case 'length':
      return Array.isArray(a) || typeof a === 'string' ? a.length : 0;
  }
  return null;
}

/** Checks an expression before it is saved: known operators only, and within the size limits. */
export function validateLogic(logic: LogicExpression): void {
  let nodes = 0;
  const walk = (node: unknown, depth: number) => {
    nodes += 1;
    if (nodes > LOGIC_LIMITS.MAX_NODES) throw new Error(`A logic condition can have at most ${LOGIC_LIMITS.MAX_NODES} parts`);
    if (depth > LOGIC_LIMITS.MAX_DEPTH) throw new Error(`A logic condition can be nested at most ${LOGIC_LIMITS.MAX_DEPTH} deep`);
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, depth + 1));
      return;
    }
    if (node !== null && typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length !== 1) throw new Error('Each logic operation must be an object with exactly one operator');
      const op = keys[0]!;
      if (!OPERATORS.has(op)) throw new Error(`Unsupported logic operator: ${op}`);
      const arg = (node as Record<string, unknown>)[op];
      if (op === 'var' && typeof (Array.isArray(arg) ? arg[0] : arg) === 'string' && FORBIDDEN_PATH.test(String(Array.isArray(arg) ? arg[0] : arg))) {
        throw new Error('That variable path is not allowed');
      }
      walk(arg, depth + 1);
    }
  };
  walk(logic, 1);
}
