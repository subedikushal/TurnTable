import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { WorkerEnvironment } from './config';

export const WORKER_LOGGER = Symbol('WORKER_LOGGER');
export const FOUNDATION_QUEUE = 'turntable-foundation';

export interface FoundationProbePayload {
  requested_at: string;
}

@Injectable()
export class WorkerRuntimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue<FoundationProbePayload>;
  private readonly queueEvents: QueueEvents;
  private readonly worker: Worker<FoundationProbePayload>;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WORKER_LOGGER) private readonly logger: Logger,
  ) {
    this.connection = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    const shared = { connection: this.connection };
    this.queue = new Queue<FoundationProbePayload>(FOUNDATION_QUEUE, shared);
    this.queueEvents = new QueueEvents(FOUNDATION_QUEUE, shared);
    this.worker = new Worker<FoundationProbePayload>(
      FOUNDATION_QUEUE,
      async (job: Job<FoundationProbePayload>) => {
        if (job.name !== 'foundation.ping')
          throw new Error(`Unsupported foundation job: ${job.name}`);
        this.logger.info(
          { job_id: job.id, queue: FOUNDATION_QUEUE },
          'worker processed Redis probe',
        );
        return { acknowledged_at: new Date().toISOString() };
      },
      {
        ...shared,
        concurrency: config.get('WORKER_CONCURRENCY', { infer: true }),
      },
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const pong = await this.connection.ping();
    if (pong !== 'PONG') throw new Error('Redis connectivity probe failed');
    await this.worker.waitUntilReady();
    this.logger.info({ redis: 'connected', queue: FOUNDATION_QUEUE }, 'TurnTable worker started');

    if (this.config.get('WORKER_PROBE_ON_START', { infer: true }) === 'true') {
      const job = await this.queue.add(
        'foundation.ping',
        { requested_at: new Date().toISOString() },
        { removeOnComplete: true, removeOnFail: 100 },
      );
      await job.waitUntilFinished(this.queueEvents, 10_000);
      this.logger.info({ job_id: job.id }, 'startup worker probe completed');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    await this.queueEvents.close();
    await this.queue.close();
    this.connection.disconnect(false);
  }
}
