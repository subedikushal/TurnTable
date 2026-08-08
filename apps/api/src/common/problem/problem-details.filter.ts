import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ExceptionFilter,
} from '@nestjs/common';
import { currentTraceId } from '@turntable/observability';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { APP_LOGGER } from '../logging/logging.tokens';
import type { ProblemDetailsDto, ProblemErrorDto } from './problem.dto';

const DEFAULT_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'DEPENDENCY_UNAVAILABLE',
};

interface ExceptionBody {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  errors?: unknown;
  error?: unknown;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody = typeof response === 'object' && response !== null ? response : {};
    const code =
      typeof body.code === 'string' ? body.code : (DEFAULT_CODE[status] ?? 'INTERNAL_ERROR');
    const rawDetail = body.detail ?? body.message;
    const detail = Array.isArray(rawDetail)
      ? 'One or more request fields are invalid'
      : typeof rawDetail === 'string'
        ? rawDetail
        : status >= 500
          ? 'An unexpected error occurred'
          : 'The request could not be completed';
    const title =
      typeof body.error === 'string'
        ? body.error
        : status >= 500
          ? 'Internal server error'
          : detail;
    const traceId = currentTraceId() ?? request.id;
    const errors = Array.isArray(body.errors) ? (body.errors as ProblemErrorDto[]) : undefined;
    const problem: ProblemDetailsDto = {
      type: `https://api.turntable.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      detail,
      trace_id: traceId,
      ...(errors ? { errors } : {}),
    };

    if (status >= 500) {
      this.logger.error(
        { err: exception, request_id: request.id, trace_id: traceId },
        'request failed',
      );
    }
    void reply.status(status).type('application/problem+json').send(problem);
  }
}
