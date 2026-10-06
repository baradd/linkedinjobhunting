import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchJson } from '../../common/text.util';
import { Job, JobSource } from '../job.interface';

interface RemotiveResponse {
  jobs: Array<{
    id: number;
    url: string;
    title: string;
    company_name: string;
    tags?: string[];
    publication_date?: string;
    candidate_required_location?: string;
    description?: string;
  }>;
}

/** https://remotive.com/api/remote-jobs : free, remote-only jobs. Keep the interval long (their API is rate-limited). */
@Injectable()
export class RemotiveSource implements JobSource {
  readonly name = 'remotive';
  readonly intervalMinutes: number;

  constructor(config: ConfigService) {
    this.intervalMinutes = config.getOrThrow<number>('sources.remotiveIntervalMin');
  }

  isEnabled(): boolean {
    return true;
  }

  async fetch(): Promise<Job[]> {
    const data = await fetchJson<RemotiveResponse>(
      'https://remotive.com/api/remote-jobs?category=software-dev&search=node',
    );
    return (data.jobs ?? []).map((j) => ({
      id: `remotive:${j.id}`,
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || 'Remote',
      remote: true,
      url: j.url,
      source: this.name,
      tags: j.tags ?? [],
      description: j.description ?? '',
      postedAt: j.publication_date ? new Date(j.publication_date) : undefined,
    }));
  }
}
