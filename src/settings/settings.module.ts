import { Module } from '@nestjs/common';
import { OwnerService } from './owner.service';
import { SettingsService } from './settings.service';

@Module({
  providers: [SettingsService, OwnerService],
  exports: [SettingsService, OwnerService],
})
export class SettingsModule {}
