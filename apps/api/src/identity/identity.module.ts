import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Environment } from '../config/environment';
import { CurrentUserService } from './application/current-user.service';
import { BearerAuthGuard } from './api/bearer-auth.guard';
import { MeController } from './api/me.controller';
import { OIDC_TOKEN_VERIFIER } from './domain/auth-principal';
import { DevelopmentTokenVerifier, RemoteOidcTokenVerifier } from './infra/oidc-token-verifier';
import { UserRepository } from './infra/user.repository';

@Module({
  controllers: [MeController],
  providers: [
    CurrentUserService,
    UserRepository,
    DevelopmentTokenVerifier,
    RemoteOidcTokenVerifier,
    {
      provide: OIDC_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        config.get('AUTH_MODE', { infer: true }) === 'development'
          ? new DevelopmentTokenVerifier(config)
          : new RemoteOidcTokenVerifier(config),
    },
    { provide: APP_GUARD, useClass: BearerAuthGuard },
  ],
  exports: [CurrentUserService],
})
export class IdentityModule {}
