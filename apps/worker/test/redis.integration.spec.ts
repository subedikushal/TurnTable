import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { NestFactory } from '@nestjs/core';

describe('worker Redis integration', () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
  });

  afterAll(async () => {
    await container.stop();
  });

  it('starts the worker and round-trips a BullMQ probe through real Redis', async () => {
    Object.assign(process.env, {
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
      REDIS_URL: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
      WORKER_PROBE_ON_START: 'true',
    });
    const { WorkerModule } = await import('../src/worker.module');
    const app = await NestFactory.createApplicationContext(WorkerModule, {
      abortOnError: false,
      logger: ['error'],
    });
    await app.close();
  });
});
