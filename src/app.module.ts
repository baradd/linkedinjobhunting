import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import configuration from './config/configuration';
import { JobsModule } from './jobs/jobs.module';
import { NotifierModule } from './notifier/notifier.module';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('telegram.token');
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required (see .env.example)');
        return { token };
      },
    }),
    RedisModule,
    SettingsModule,
    NotifierModule,
    JobsModule,
    BotModule,
  ],
})
export class AppModule {}
