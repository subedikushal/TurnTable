import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { LoggingModule } from './common/logging/logging.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HouseholdsModule } from './modules/households/households.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ResponsibilitiesModule } from './modules/responsibilities/responsibilities.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { SwapsModule } from './modules/swaps/swaps.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    LoggingModule,
    DatabaseModule,
    RedisModule,
    IdentityModule,
    HealthModule,
    HouseholdsModule,
    ResponsibilitiesModule,
    SwapsModule,
    ExpensesModule,
    SettlementsModule,
    NotificationsModule,
    AnalyticsModule,
    ActivityModule,
  ],
})
export class AppModule {}
