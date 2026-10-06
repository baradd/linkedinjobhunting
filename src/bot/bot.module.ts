import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { NotifierModule } from '../notifier/notifier.module';
import { SettingsModule } from '../settings/settings.module';
import { BotUpdate } from './bot.update';

@Module({
  imports: [JobsModule, SettingsModule, NotifierModule],
  providers: [BotUpdate],
})
export class BotModule {}
