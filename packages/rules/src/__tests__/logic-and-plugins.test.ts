import { afterEach, describe, expect, it } from 'vitest';
import { evaluateConditionTree } from '../evaluator.js';
import { applyLogic, validateLogic } from '../logic.js';
import { loadPlugins } from '../node.js';
import { clearPlugins, definePlugin, getPluginAction, listPlugins, registerPlugin } from '../plugins.js';
import { validateRuleForSave } from '../validator.js';
import type { EventData } from '../types.js';

const event: EventData = {
  id: 'evt_1',
  projectId: 'prj_1',
  userId: 'usr_1',
  type: 'order_placed',
  payload: { price: 30, qty: 4, tags: ['gift', 'promo'], country: 'IN', items: [{ sku: 'a', price: 5 }, { sku: 'b', price: 50 }] },
  occurredAt: new Date('2026-11-08T10:00:00Z'),
};

describe('logic conditions', () => {
  it('does arithmetic and comparisons on the payload', () => {
    const over100 = { logic: { '>': [{ '*': [{ var: 'payload.price' }, { var: 'payload.qty' }] }, 100] } };
    expect(evaluateConditionTree(over100, event)).toBe(true);
    const between = { logic: { '<=': [1, { var: 'payload.qty' }, 3] } };
    expect(evaluateConditionTree(between, event)).toBe(false);
  });

  it('supports lists, text, branches and missing values', () => {
    expect(applyLogic({ in: ['promo', { var: 'payload.tags' }] }, { payload: event.payload })).toBe(true);
    expect(applyLogic({ some: [{ var: 'payload.items' }, { '>': [{ var: 'price' }, 20] }] }, { payload: event.payload })).toBe(true);
    expect(applyLogic({ all: [{ var: 'payload.items' }, { '>': [{ var: 'price' }, 20] }] }, { payload: event.payload })).toBe(false);
    expect(applyLogic({ cat: ['a', 1, null] }, {})).toBe('a1');
    expect(applyLogic({ if: [{ '==': [{ var: 'payload.country' }, 'US'] }, 'us', 'elsewhere'] }, { payload: event.payload })).toBe('elsewhere');
    expect(applyLogic({ missing: ['payload.price', 'payload.nope'] }, { payload: event.payload })).toEqual(['payload.nope']);
    expect(applyLogic({ var: ['payload.nope', 7] }, { payload: event.payload })).toBe(7);
    expect(applyLogic({ '/': [1, 0] }, {})).toBeNull();
  });

  it('can read the event type and time', () => {
    expect(evaluateConditionTree({ logic: { '==': [{ var: 'type' }, 'order_placed'] } }, event)).toBe(true);
    expect(evaluateConditionTree({ logic: { '>=': [{ var: 'occurredAt' }, '2026-11-01'] } }, event)).toBe(true);
  });

  it('mixes with ordinary conditions', () => {
    const tree = { all: [{ field: 'payload.country', operator: 'equals' as const, value: 'IN' }, { logic: { '>': [{ var: 'payload.qty' }, 3] } }] };
    expect(evaluateConditionTree(tree, event)).toBe(true);
  });

  it('cannot reach outside the data', () => {
    expect(applyLogic({ var: '__proto__.polluted' }, {})).toBeNull();
    expect(applyLogic({ var: 'constructor' }, {})).toBeNull();
    expect(() => validateLogic({ var: 'payload.__proto__' })).toThrow('not allowed');
  });

  it('rejects unknown operators and oversized expressions when saving', () => {
    expect(() => validateLogic({ eval: 'x' })).toThrow('Unsupported logic operator');
    expect(() => validateLogic({ '==': [1, 1], '!=': [1, 2] })).toThrow('exactly one operator');
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = { '!': [deep] };
    expect(() => validateLogic(deep)).toThrow('nested');
    const rule = { trigger: 'x', conditions: { logic: { foo: 1 } }, actions: [{ type: 'award_xp', params: { amount: 1 } }] };
    expect(() => validateRuleForSave(rule)).toThrow('Unsupported logic operator');
  });
});

describe('plugins', () => {
  afterEach(() => clearPlugins());

  const gift = definePlugin({
    name: 'acme',
    version: '1.0.0',
    actions: {
      'acme.send_gift': {
        label: 'Send a gift',
        validate: (params) => {
          if (typeof params['sku'] !== 'string') throw new Error('acme.send_gift needs a sku');
        },
        run: () => undefined,
      },
    },
  });

  it('lets a rule use a plugin action, checked by the plugin', () => {
    registerPlugin(gift);
    expect(validateRuleForSave({ trigger: 'x', actions: [{ type: 'acme.send_gift', params: { sku: 'mug' } }] })).toBeTruthy();
    expect(() => validateRuleForSave({ trigger: 'x', actions: [{ type: 'acme.send_gift', params: {} }] })).toThrow('needs a sku');
    expect(listPlugins().actions).toEqual([{ type: 'acme.send_gift', label: 'Send a gift', description: null, plugin: 'acme' }]);
  });

  it('still rejects actions nobody provides', () => {
    expect(() => validateRuleForSave({ trigger: 'x', actions: [{ type: 'acme.send_gift', params: { sku: 'mug' } }] })).toThrow('Unsupported action type');
  });

  it('requires namespaced, unique action names', () => {
    expect(() => registerPlugin({ name: 'bad', actions: { award_xp: { label: 'x', run: () => undefined } } })).toThrow('namespaced');
    registerPlugin(gift);
    expect(() => registerPlugin({ name: 'other', actions: { 'acme.send_gift': { label: 'x', run: () => undefined } } })).toThrow('twice');
  });

  it('loads plugins named in the environment and reports a bad one clearly', async () => {
    expect(await loadPlugins('')).toBe(0);
    await expect(loadPlugins('./does-not-exist.mjs')).rejects.toThrow('Could not load the plugin');
    expect(getPluginAction('acme.send_gift')).toBeUndefined();
  });
});
