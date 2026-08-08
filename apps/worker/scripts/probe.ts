import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { FOUNDATION_QUEUE, type FoundationProbePayload } from '../src/worker-runtime.service';

async function main(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) throw new Error('REDIS_URL is required');
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<FoundationProbePayload>(FOUNDATION_QUEUE, { connection });
  const events = new QueueEvents(FOUNDATION_QUEUE, { connection });
  await events.waitUntilReady();
  const job = await queue.add(
    'foundation.ping',
    { requested_at: new Date().toISOString() },
    { removeOnComplete: true, removeOnFail: 100 },
  );
  const result: unknown = await job.waitUntilFinished(events, 10_000);
  process.stdout.write(`${JSON.stringify({ job_id: job.id, result })}\n`);
  await events.close();
  await queue.close();
  connection.disconnect(false);
}

void main();
