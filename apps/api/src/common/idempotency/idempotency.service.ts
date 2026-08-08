import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

interface IdempotentWorkResult<T> {
  status: number;
  body: T;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  assertKey(key: string | undefined): asserts key is string {
    if (!key || key.length < 8 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain 8 to 200 visible ASCII characters',
        errors: [{ field: 'Idempotency-Key', reason: 'invalid_idempotency_key' }],
      });
    }
  }

  requestHash(request: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(canonicalize(request)))
      .digest('hex');
  }

  async execute<T>(options: {
    actorUserId: string;
    operationScope: string;
    idempotencyKey: string;
    logicalRequest: unknown;
    work: (transaction: Prisma.TransactionClient) => Promise<IdempotentWorkResult<T>>;
  }): Promise<IdempotentResult<T>> {
    const requestHash = this.requestHash(options.logicalRequest);
    const lockName = [options.actorUserId, options.operationScope, options.idempotencyKey].join(
      ':',
    );

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT 1::integer AS locked
        FROM pg_advisory_xact_lock(hashtextextended(${lockName}, 0))
      `;
      const existing = await transaction.idempotencyRecord.findUnique({
        where: {
          actorUserId_operationScope_idempotencyKey: {
            actorUserId: options.actorUserId,
            operationScope: options.operationScope,
            idempotencyKey: options.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key was already used for a different request',
          });
        }
        return {
          status: existing.responseStatus,
          body: existing.responseBody as T,
          replayed: true,
        };
      }

      const result = await options.work(transaction);
      await transaction.idempotencyRecord.create({
        data: {
          actorUserId: options.actorUserId,
          operationScope: options.operationScope,
          idempotencyKey: options.idempotencyKey,
          requestHash,
          responseStatus: result.status,
          responseBody: result.body as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return { ...result, replayed: false };
    });
  }
}
