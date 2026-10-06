import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { slug, sleep } from '../common/text.util';
import { NotifierService } from '../notifier/notifier.service';
import { REDIS } from '../redis/redis.module';
import { OwnerService } from '../settings/owner.service';
import { SettingsService } from '../settings/settings.service';
import { matchesJob } from './job-filter';
import { Job, JOB_SOURCES, JobSource } from './job.interface';

export interface PollSummary {
  skipped?: 'already running' | 'paused' | 'not paired (send /start to the bot)';
  fetched: Record<string, number>;
  errors: string[];
  matched: number;
  sent: number;
}

export interface SourceStatus {
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRun: Date | null;
}

const SEEN_TTL_SECONDS = 60 * 60 * 24 * 60; // remember a posting for 60 days
const RECENT_KEY = 'recent';
const BOOTSTRAP_KEY = 'bootstrapped';
const BOOTSTRAP_NOTIFY = 5; // on the very first run, only notify the newest N and silently mark the rest as seen

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private running = false;

  constructor(
    @Inject(JOB_SOURCES) private readonly sources: JobSource[],
    @Inject(REDIS) private readonly redis: Redis,
    private readonly settings: SettingsService,
    private readonly notifier: NotifierService,
    private readonly config: ConfigService,
    private readonly owner: OwnerService,
  ) {}

  /** Runs every minute; each source only actually fetches when its own interval has elapsed. */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.poll(false);
    } catch (err) {
      this.logger.error(`Poll failed: ${(err as Error).message}`);
    }
  }

  async poll(force: boolean): Promise<PollSummary> {
    const summary: PollSummary = { fetched: {}, errors: [], matched: 0, sent: 0 };
    if (this.running) return { ...summary, skipped: 'already running' };
    this.running = true;

    try {
      if (!(await this.owner.getChatId())) return { ...summary, skipped: 'not paired (send /start to the bot)' };

      const settings = await this.settings.get();
      if (settings.paused && !force) return { ...summary, skipped: 'paused' };

      const candidates: Job[] = [];
      for (const src of this.sources) {
        if (!src.isEnabled()) continue;
        const lastKey = `source:last:${src.name}`;
        if (!force) {
          const last = Number((await this.redis.get(lastKey)) ?? 0);
          if (Date.now() - last < src.intervalMinutes * 60_000) continue;
        }
        try {
          const jobs = await src.fetch();
          await this.redis.set(lastKey, Date.now());
          summary.fetched[src.name] = jobs.length;
          candidates.push(...jobs);
        } catch (err) {
          const msg = `${src.name}: ${(err as Error).message}`;
          summary.errors.push(msg);
          this.logger.warn(`Source failed: ${msg}`);
        }
      }

      const maxAgeMs = this.config.getOrThrow<number>('jobs.maxAgeDays') * 86_400_000;
      const matchDescription = this.config.getOrThrow<boolean>('jobs.matchDescription');
      const now = Date.now();

      const matching = candidates
        .filter((j) => !j.postedAt || Number.isNaN(j.postedAt.getTime()) || now - j.postedAt.getTime() <= maxAgeMs)
        .filter((j) => matchesJob(j, settings, { matchDescription }))
        .sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
      summary.matched = matching.length;

      const firstRun = !(await this.redis.get(BOOTSTRAP_KEY));
      let notified = 0;

      for (const job of matching) {
        const idKey = `seen:id:${job.id}`;
        const tcKey = `seen:tc:${slug(job.title)}|${slug(job.company)}`;

        // dedupe by posting id, then by title+company (same job posted on two sources)
        if ((await this.redis.set(idKey, '1', 'EX', SEEN_TTL_SECONDS, 'NX')) !== 'OK') continue;
        if ((await this.redis.set(tcKey, '1', 'EX', SEEN_TTL_SECONDS, 'NX')) !== 'OK') continue;

        if (firstRun && notified >= BOOTSTRAP_NOTIFY) continue; // baseline: mark as seen, don't notify

        try {
          await this.notifier.sendJob(job);
          notified++;
          summary.sent++;
          await this.pushRecent(job);
          await sleep(400);
        } catch (err) {
          // allow a retry on the next fetch
          await this.redis.del(idKey, tcKey);
          summary.errors.push(`notify ${job.id}: ${(err as Error).message}`);
          this.logger.warn(`Could not notify ${job.id}: ${(err as Error).message}`);
        }
      }

      if (firstRun && Object.keys(summary.fetched).length > 0) {
        await this.redis.set(BOOTSTRAP_KEY, '1');
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  async recent(limit = 10): Promise<Job[]> {
    const raw = await this.redis.lrange(RECENT_KEY, 0, limit - 1);
    return raw.map((r) => JSON.parse(r) as Job);
  }

  async status(): Promise<SourceStatus[]> {
    return Promise.all(
      this.sources.map(async (s) => {
        const last = Number((await this.redis.get(`source:last:${s.name}`)) ?? 0);
        return {
          name: s.name,
          enabled: s.isEnabled(),
          intervalMinutes: s.intervalMinutes,
          lastRun: last ? new Date(last) : null,
        };
      }),
    );
  }

  private async pushRecent(job: Job): Promise<void> {
    const { description: _description, ...light } = job;
    await this.redis.lpush(RECENT_KEY, JSON.stringify(light));
    await this.redis.ltrim(RECENT_KEY, 0, 49);
  }
}
