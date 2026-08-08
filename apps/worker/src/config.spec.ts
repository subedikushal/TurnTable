import { describe, expect, it } from 'vitest';
import { validateWorkerEnvironment } from './config';

describe('worker configuration', () => {
  it('fails clearly when required infrastructure URLs are absent', () => {
    expect(() => validateWorkerEnvironment({ APP_ENV: 'test' })).toThrow(
      'Invalid TurnTable worker configuration',
    );
  });
});
