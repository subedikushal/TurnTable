import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { OIDC_TOKEN_VERIFIER, type OidcTokenVerifier } from '../domain/auth-principal';
import type { AuthenticatedRequest } from './authenticated-request';
import { IS_PUBLIC_ROUTE } from './public.decorator';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OIDC_TOKEN_VERIFIER) private readonly verifier: OidcTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Bearer token is required',
      });
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Bearer token is required',
      });
    }
    (request as AuthenticatedRequest).authPrincipal = await this.verifier.verify(token);
    return true;
  }
}
