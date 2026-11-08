import { describe, expect, it } from 'vitest';
import {
  interpolate,
  LIFECYCLE_DEFAULTS,
  LIFECYCLE_KINDS,
  renderLifecycleEmail,
  sampleValues,
  validateLifecycleConfig,
  validateLifecycleTemplate,
  variablesIn,
} from '../lifecycle.js';

describe('templates', () => {
  it('lists the variables a text uses, once each', () => {
    expect(variablesIn('Hi {{name}}, {{ name }} has {{xp_total}} XP')).toEqual(['name', 'xp_total']);
  });

  it('fills in known values and leaves unknown ones visible', () => {
    expect(interpolate('Hi {{name}} {{nope}}', { name: 'Ada' })).toBe('Hi Ada {{nope}}');
  });

  it('ships working defaults for every kind', () => {
    for (const kind of LIFECYCLE_KINDS) {
      const { subject, body } = LIFECYCLE_DEFAULTS[kind];
      expect(validateLifecycleTemplate(kind, subject, body)).toEqual([]);
      const email = renderLifecycleEmail({ subject, body }, sampleValues(kind), 'Acme');
      expect(email.subject).not.toContain('{{');
      expect(email.textBody).not.toContain('{{');
      expect(email.htmlBody).not.toContain('{{');
    }
  });

  it('rejects variables the kind does not provide, and empty or oversized text', () => {
    expect(validateLifecycleTemplate('winback', 'Hi {{streak_name}}', 'Body')).toEqual(['Unknown variable: {{streak_name}}']);
    expect(validateLifecycleTemplate('winback', '', 'Body')).toContain('The subject cannot be empty');
    expect(validateLifecycleTemplate('winback', 'Hi', ' ')).toContain('The message cannot be empty');
    expect(validateLifecycleTemplate('winback', 'x'.repeat(201), 'Body')[0]).toMatch(/subject can be at most/);
  });

  it('escapes values in the HTML so a name cannot inject markup', () => {
    const email = renderLifecycleEmail(
      { subject: 'Hi {{name}}', body: 'Dear {{name}},\n\nSecond paragraph.' },
      { name: '<script>alert(1)</script>' }
    );
    expect(email.htmlBody).not.toContain('<script>alert(1)</script>');
    expect(email.htmlBody).toContain('&lt;script&gt;');
    expect(email.htmlBody.match(/<p>/g)).toHaveLength(2);
    expect(email.textBody).toContain('<script>alert(1)</script>'); // plain text is not markup
  });

  it('keeps the subject on one line', () => {
    expect(renderLifecycleEmail({ subject: 'A {{name}}', body: 'x' }, { name: 'B\nBcc: x@y.z' }).subject).toBe('A B Bcc: x@y.z');
  });
});

describe('config', () => {
  it('requires the streak for a reminder and fills defaults', () => {
    expect(validateLifecycleConfig('streak_reminder', {})).toEqual({ error: 'Choose the streak to remind people about' });
    expect(validateLifecycleConfig('streak_reminder', { streak: 'daily' })).toEqual({ config: { streak: 'daily', sendAfterHour: 18 } });
    expect(validateLifecycleConfig('streak_reminder', { streak: 'daily', sendAfterHour: 24 })).toHaveProperty('error');
  });

  it('checks the recap day and hour', () => {
    expect(validateLifecycleConfig('weekly_recap', undefined)).toEqual({ config: { weekday: 0, hour: 9 } });
    expect(validateLifecycleConfig('weekly_recap', { weekday: 7 })).toHaveProperty('error');
    expect(validateLifecycleConfig('weekly_recap', { hour: -1 })).toHaveProperty('error');
  });

  it('needs win-back to stop after it starts', () => {
    expect(validateLifecycleConfig('winback', {})).toEqual({ config: { inactiveDays: 14, maxDays: 90 } });
    expect(validateLifecycleConfig('winback', { inactiveDays: 30, maxDays: 20 })).toHaveProperty('error');
    expect(validateLifecycleConfig('winback', { inactiveDays: 0 })).toHaveProperty('error');
  });
});
