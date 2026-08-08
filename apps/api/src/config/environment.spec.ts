import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const base = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://turntable:turntable@localhost:5432/turntable',
  REDIS_URL: 'redis://localhost:6379',
  INVITATION_TOKEN_SECRET: 'turntable-invitation-secret-at-least-32-characters',
};

describe('API configuration', () => {
  it('rejects development authentication in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        APP_ENV: 'production',
        AUTH_MODE: 'development',
        DEV_AUTH_SECRET: 'turntable-development-secret-at-least-32-characters',
      }),
    ).toThrow('development authentication is permitted only');
  });

  it('requires OIDC issuer and audience in OIDC mode', () => {
    expect(() => validateEnvironment({ ...base, AUTH_MODE: 'oidc' })).toThrow('OIDC_ISSUER_URL');
  });
});
