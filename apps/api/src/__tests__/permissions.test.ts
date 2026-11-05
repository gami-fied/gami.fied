import { describe, expect, it } from 'vitest';
import {
  hasScope,
  isValidScope,
  resolveProjectPermission,
} from '../authorization/permissions.js';

const P = '/api/projects/:projectId';

describe('permission map', () => {
  it.each([
    ['GET', `${P}/rules`, 'rules:read', 'member'],
    ['POST', `${P}/rules`, 'rules:write', 'admin'],
    ['PATCH', `${P}/rules/:ruleId`, 'rules:write', 'admin'],
    ['DELETE', `${P}/rules/:ruleId`, 'rules:write', 'admin'],
    ['GET', `${P}/users/:userId/xp`, 'xp:read', 'member'],
    ['POST', `${P}/users/:userId/xp/adjust`, 'xp:write', 'admin'],
    ['GET', `${P}/users/:userId/progress`, 'levels:read', 'member'],
    ['GET', `${P}/users/:userId`, 'users:read', 'member'],
    ['GET', `${P}/users/by-external-id/:externalId`, 'users:read', 'member'],
    ['GET', `${P}/metrics`, 'system:read', 'member'],
    ['GET', `${P}/email-deliveries`, 'notifications:read', 'admin'],
    ['GET', `${P}/audit-logs`, 'audit-logs:read', 'admin'],
  ])('%s %s needs %s and role %s', (method, url, scope, minRole) => {
    expect(resolveProjectPermission(method, url)).toMatchObject({
      scope,
      minRole,
      sessionOnly: false,
    });
  });

  it('treats rule preview as a read', () => {
    expect(resolveProjectPermission('POST', `${P}/rules/preview`)).toMatchObject({
      scope: 'rules:read',
      minRole: 'member',
    });
  });

  it('lets members send test events and manage notifications', () => {
    expect(resolveProjectPermission('POST', `${P}/events/test`).minRole).toBe('member');
    expect(
      resolveProjectPermission('POST', `${P}/users/:userId/notifications/read-all`).minRole
    ).toBe('member');
  });

  it.each([
    ['GET', `${P}/api-keys`],
    ['POST', `${P}/api-keys`],
    ['DELETE', `${P}/api-keys/:keyId`],
    ['POST', `${P}/api-keys/:keyId/rotate`],
    ['GET', `${P}/members`],
    ['POST', `${P}/members`],
    ['PATCH', '/api/projects/:id'],
    ['DELETE', '/api/projects/:id'],
  ])('closes %s %s to API keys', (method, url) => {
    expect(resolveProjectPermission(method, url).sessionOnly).toBe(true);
  });

  it('allows a key to read its own project', () => {
    expect(resolveProjectPermission('GET', '/api/projects/:id')).toMatchObject({
      scope: 'project:read',
      sessionOnly: false,
    });
  });

  it('fails closed for routes it does not recognise', () => {
    expect(resolveProjectPermission('POST', `${P}/brand-new-feature`)).toMatchObject({
      sessionOnly: true,
      minRole: 'admin',
    });
    expect(resolveProjectPermission('GET', '/api/something-else')).toMatchObject({
      sessionOnly: true,
      minRole: 'admin',
    });
  });
});

describe('API key scopes', () => {
  it('accepts known scopes and rejects everything else', () => {
    expect(isValidScope('*')).toBe(true);
    expect(isValidScope('events:write')).toBe(true);
    expect(isValidScope('audit-logs:read')).toBe(true);
    expect(isValidScope('events:delete')).toBe(false);
    expect(isValidScope('api-keys:write')).toBe(false);
    expect(isValidScope('members:read')).toBe(false);
    expect(isValidScope('')).toBe(false);
  });

  it('lets write imply read on the same resource only', () => {
    expect(hasScope(['rules:write'], 'rules:read')).toBe(true);
    expect(hasScope(['rules:read'], 'rules:write')).toBe(false);
    expect(hasScope(['rules:write'], 'xp:read')).toBe(false);
    expect(hasScope(['*'], 'rules:write')).toBe(true);
    expect(hasScope([], 'rules:read')).toBe(false);
  });
});
