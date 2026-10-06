import { containsWord } from '../common/text.util';
import { Settings } from '../settings/settings.service';
import { Job } from './job.interface';

export interface FilterOptions {
  matchDescription: boolean;
}

export function matchesJob(job: Job, s: Settings, opts: FilterOptions): boolean {
  const title = job.title.toLowerCase();
  if (s.excludes.some((w) => containsWord(title, w))) return false;

  const haystack = [
    job.title,
    ...(job.tags ?? []),
    opts.matchDescription ? (job.description ?? '').slice(0, 1500) : '',
  ]
    .join('\n')
    .toLowerCase();
  if (!s.keywords.some((k) => containsWord(haystack, k))) return false;

  if (s.locations.length > 0) {
    const loc = (job.location ?? '').toLowerCase();
    const locationOk = s.locations.some((l) => loc.includes(l.toLowerCase()));
    const remoteOk = s.includeRemote && job.remote === true;
    if (!locationOk && !remoteOk) return false;
  }
  return true;
}
