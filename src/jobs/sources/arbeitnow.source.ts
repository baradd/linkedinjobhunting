import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchJson, isSourceDisabled, stripHtml } from '../../common/text.util';
import { Job, JobSource } from '../job.interface';

interface ArbeitnowResponse {
  data: Array<{
    slug: string;
    company_name: string;
    title: string;
    description?: string;
    remote?: boolean;
    url: string;
    tags?: string[];
    location?: string;
    created_at?: number; // unix seconds
  }>;
}

/** https://www.arbeitnow.com/api/job-board-api : free, mostly Europe, many visa-sponsoring/relocation roles. */
@Injectable()
export class ArbeitnowSource implements JobSource {
  readonly name = 'arbeitnow';
  readonly intervalMinutes: number;

  constructor(config: ConfigService) {
    this.intervalMinutes = config.getOrThrow<number>(
      'sources.arbeitnowIntervalMin',
    );
  }

  isEnabled(): boolean {
    return !isSourceDisabled(this.name);
  }

  async fetch(): Promise<Job[]> {
    const data = await fetchJson<ArbeitnowResponse>(
      'https://www.arbeitnow.com/api/job-board-api',
    );
    return (data.data ?? []).map((j) => ({
      id: `arbeitnow:${j.slug}`,
      title: j.title,
      company: j.company_name,
      location: j.location,
      remote: j.remote === true,
      url: j.url,
      source: this.name,
      tags: j.tags ?? [],
      description: stripHtml(j.description ?? '').slice(0, 2000),
      postedAt: j.created_at ? new Date(j.created_at * 1000) : undefined,
    }));
  }
}
