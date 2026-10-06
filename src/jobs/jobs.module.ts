import { Module } from '@nestjs/common';
import { NotifierModule } from '../notifier/notifier.module';
import { SettingsModule } from '../settings/settings.module';
import { JOB_SOURCES } from './job.interface';
import { JobsService } from './jobs.service';
import { ArbeitnowSource } from './sources/arbeitnow.source';
import { LinkedinEmailSource } from './sources/linkedin-email.source';
import { RemotiveSource } from './sources/remotive.source';

@Module({
  imports: [SettingsModule, NotifierModule],
  providers: [
    RemotiveSource,
    ArbeitnowSource,
    LinkedinEmailSource,
    {
      // To add a source: create a class implementing JobSource, add it here and in `inject`.
      provide: JOB_SOURCES,
      useFactory: (...sources: unknown[]) => sources,
      inject: [RemotiveSource, ArbeitnowSource, LinkedinEmailSource],
    },
    JobsService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
