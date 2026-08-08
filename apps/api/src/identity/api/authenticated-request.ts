import type { FastifyRequest } from 'fastify';
import type { AuthPrincipal } from '../domain/auth-principal';

export interface AuthenticatedRequest extends FastifyRequest {
  authPrincipal: AuthPrincipal;
}
