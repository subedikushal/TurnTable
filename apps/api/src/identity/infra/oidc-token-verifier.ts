import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';
import type { Environment } from '../../config/environment';
import type { AuthPrincipal, OidcTokenVerifier } from '../domain/auth-principal';

interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

function mapClaims(payload: Record<string, unknown>): AuthPrincipal {
  if (typeof payload['sub'] !== 'string' || payload['sub'].length === 0) {
    throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Token subject is missing' });
  }

  const scope =
    typeof payload['scope'] === 'string' ? payload['scope'].split(' ').filter(Boolean) : [];
  return {
    subject: payload['sub'],
    scopes: scope,
    ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
    ...(typeof payload['name'] === 'string' ? { displayName: payload['name'] } : {}),
  };
}

@Injectable()
export class RemoteOidcTokenVerifier implements OidcTokenVerifier {
  private keySetPromise?: Promise<JWTVerifyGetKey>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {}

  private async getKeySet(): Promise<JWTVerifyGetKey> {
    this.keySetPromise ??= (async () => {
      const issuer = this.config.get('OIDC_ISSUER_URL', { infer: true });
      if (!issuer) throw new Error('OIDC issuer is not configured');
      const discoveryUrl = new URL(
        '.well-known/openid-configuration',
        `${issuer.replace(/\/$/, '')}/`,
      );
      const response = await fetch(discoveryUrl);
      if (!response.ok) throw new Error('OIDC discovery failed');
      const document = (await response.json()) as Partial<DiscoveryDocument & JSONWebKeySet>;
      if (typeof document.jwks_uri !== 'string') throw new Error('OIDC discovery omitted jwks_uri');
      return createRemoteJWKSet(new URL(document.jwks_uri));
    })();
    return this.keySetPromise;
  }

  async verify(token: string): Promise<AuthPrincipal> {
    try {
      const issuer = this.config.get('OIDC_ISSUER_URL', { infer: true });
      const audience = this.config.get('OIDC_AUDIENCE', { infer: true });
      if (!issuer || !audience) throw new Error('OIDC configuration is incomplete');
      const result = await jwtVerify(token, await this.getKeySet(), { issuer, audience });
      return mapClaims(result.payload);
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Bearer token is invalid',
      });
    }
  }
}

@Injectable()
export class DevelopmentTokenVerifier implements OidcTokenVerifier {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {}

  async verify(token: string): Promise<AuthPrincipal> {
    try {
      const secret = this.config.get('DEV_AUTH_SECRET', { infer: true });
      const audience = this.config.get('OIDC_AUDIENCE', { infer: true }) ?? 'turntable-api';
      if (!secret) throw new Error('development authentication is not configured');
      const result = await jwtVerify(token, new TextEncoder().encode(secret), {
        issuer: 'turntable-development',
        audience,
        algorithms: ['HS256'],
      });
      return mapClaims(result.payload);
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Bearer token is invalid',
      });
    }
  }
}
