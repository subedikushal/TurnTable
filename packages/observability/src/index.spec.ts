import { describe, expect, it } from 'vitest';
import { createLogger } from './index';

describe('structured logger', () => {
  it('creates a service-scoped logger', () => {
    const logger = createLogger({ service: 'test-service', environment: 'test' });
    expect(logger.bindings()).toMatchObject({ name: 'test-service' });
  });
});
