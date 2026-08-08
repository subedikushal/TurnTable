import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { IdentityModule } from '../../identity/identity.module';
import { HouseholdAuthorizationService } from './application/household-authorization.service';
import { HouseholdsService } from './application/households.service';
import { HouseholdsController } from './api/households.controller';
import { InvitationsController } from './api/invitations.controller';

@Module({
  imports: [IdentityModule, IdempotencyModule],
  controllers: [HouseholdsController, InvitationsController],
  providers: [HouseholdsService, HouseholdAuthorizationService],
  exports: [HouseholdAuthorizationService],
})
export class HouseholdsModule {}
