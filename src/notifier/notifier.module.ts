import { Module } from '@nestjs/common';
import { NotifierService } from './notifier.service';
import { OwnerService } from 'src/settings/owner.service';
import { SettingsModule } from 'src/settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [NotifierService],
  exports: [NotifierService],
})
export class NotifierModule {}
