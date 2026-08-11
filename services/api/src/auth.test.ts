import { describe, it, expect } from 'vitest';
import {
  roleForEmail,
  signToken,
  verifyToken,
  bearerFromHeader,
  loadAuthConfig,
  type AuthConfig,
} from './auth';

const testConfig: AuthConfig = {
  jwtSecret: 'test-secret',
  adminEmails: ['admin@pau.os', 'boss@pau.os'],
  devLoginEnabled: true,
  verifyGoogleIdToken: async () => null,
};

describe('roleForEmail', () => {
  it('grants admin to allowlisted emails (case-insensitive)', () => {
    expect(roleForEmail('admin@pau.os', testConfig.adminEmails)).toBe('admin');
    expect(roleForEmail('ADMIN@pau.os', testConfig.adminEmails)).toBe('admin');
  });
  it('defaults to student otherwise', () => {
    expect(roleForEmail('someone@example.com', testConfig.adminEmails)).toBe('student');
  });
});

describe('signToken / verifyToken', () => {
  it('round-trips an identity', () => {
    const token = signToken({ sub: 'u1', role: 'admin', email: 'admin@pau.os' }, testConfig);
    const id = verifyToken(token, testConfig);
    expect(id?.role).toBe('admin');
    expect(id?.email).toBe('admin@pau.os');
  });
  it('rejects a token signed with a different secret', () => {
    const token = signToken({ sub: 'u1', role: 'student' }, testConfig);
    expect(verifyToken(token, { ...testConfig, jwtSecret: 'other' })).toBeNull();
  });
  it('rejects garbage', () => {
    expect(verifyToken('not-a-token', testConfig)).toBeNull();
  });
});

describe('bearerFromHeader', () => {
  it('parses a Bearer header', () => {
    expect(bearerFromHeader('Bearer abc.def')).toBe('abc.def');
    expect(bearerFromHeader('bearer xyz')).toBe('xyz');
  });
  it('returns null for missing/malformed headers', () => {
    expect(bearerFromHeader(undefined)).toBeNull();
    expect(bearerFromHeader('Basic abc')).toBeNull();
  });
});

describe('loadAuthConfig', () => {
  it('enables dev login outside production by default', () => {
    expect(loadAuthConfig({ NODE_ENV: 'development' }).devLoginEnabled).toBe(true);
  });
  it('disables dev login in production unless explicitly enabled', () => {
    expect(loadAuthConfig({ NODE_ENV: 'production' }).devLoginEnabled).toBe(false);
    expect(loadAuthConfig({ NODE_ENV: 'production', AUTH_DEV_LOGIN: 'true' }).devLoginEnabled).toBe(true);
  });
  it('parses the admin allowlist', () => {
    const cfg = loadAuthConfig({ ADMIN_EMAILS: 'a@x.com, B@x.com' });
    expect(cfg.adminEmails).toEqual(['a@x.com', 'b@x.com']);
  });
  it('disables Google verification when no client id is configured', async () => {
    const cfg = loadAuthConfig({});
    expect(cfg.googleClientId).toBeUndefined();
    await expect(cfg.verifyGoogleIdToken('any-token')).resolves.toBeNull();
  });
  it('picks up the web Google client id', () => {
    const cfg = loadAuthConfig({ GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com' });
    expect(cfg.googleClientId).toBe('web.apps.googleusercontent.com');
    expect(typeof cfg.verifyGoogleIdToken).toBe('function');
  });
});
