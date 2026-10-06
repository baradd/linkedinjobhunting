import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Job, JobSource } from '../job.interface';

const list = (v: string | undefined, fallback: string[]): string[] =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;

const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export interface RawHit {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
}

type Window = 'd' | 'w' | 'm';

/** Serper.dev response -> hits */
export function parseSerper(json: unknown): RawHit[] {
  const organic =
    (
      json as {
        organic?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
          date?: string;
        }>;
      }
    )?.organic ?? [];
  return organic
    .filter((o) => o.title && o.link)
    .map((o) => ({
      title: o.title!,
      link: o.link!,
      snippet: o.snippet,
      date: o.date,
    }));
}

/** Google Programmable Search (Custom Search JSON API) response -> hits */
export function parseCse(json: unknown): RawHit[] {
  const items =
    (
      json as {
        items?: Array<{
          title?: string;
          link?: string;
          snippet?: string;
          pagemap?: { metatags?: Array<Record<string, string>> };
        }>;
      }
    )?.items ?? [];
  return items
    .filter((i) => i.title && i.link)
    .map((i) => ({
      title: i.title!,
      link: i.link!,
      snippet: i.snippet,
      date: i.pagemap?.metatags?.[0]?.['article:published_time'],
    }));
}

/** "2 days ago" / "Oct 3, 2026" / ISO date -> Date (undefined when unknown) */
export function parseRelativeDate(
  text: string | undefined,
  now = new Date(),
): Date | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  if (m) {
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    };
    return new Date(now.getTime() - Number(m[1]) * unitMs[m[2].toLowerCase()]);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildQuery(
  keyword: string,
  hiringTerms: string[],
  locations: string[],
): string {
  const hiring = hiringTerms.map((t) => `"${t}"`).join(' OR ');
  let q = `site:linkedin.com/posts (${hiring}) "${keyword}"`;
  if (locations.length)
    q += ` (${locations.map((l) => `"${l}"`).join(' OR ')})`;
  return q;
}

/** Turns one search hit into a Job. Returns null for anything that is not a LinkedIn post. */
export function hitToJob(
  hit: RawHit,
  keyword: string,
  now = new Date(),
): Job | null {
  let url: URL;
  try {
    url = new URL(hit.link);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
  if (
    !url.pathname.startsWith('/posts/') &&
    !url.pathname.startsWith('/feed/update/')
  )
    return null;

  const clean = `https://www.linkedin.com${url.pathname}`; // drops tracking params, unifies locale subdomains
  const activity = url.pathname.match(/activity[-:](\d{10,})/)?.[1];
  const id = activity
    ? `linkedinpost:${activity}`
    : `linkedinpost:${createHash('sha1').update(clean).digest('hex').slice(0, 16)}`;

  // Google shows posts as "Jane Doe on LinkedIn: <first line of the post>"
  const title = hit.title.replace(/\s*[|·-]\s*LinkedIn\s*$/i, '').trim();
  const m = title.match(/^(.*?)\s+on LinkedIn:\s*(.*)$/i);
  const author = (m?.[1] ?? '').trim();
  const headline = (m?.[2] ?? title).replace(/\s+/g, ' ').trim();

  return {
    id,
    title: headline.length > 120 ? `${headline.slice(0, 117)}…` : headline,
    company: author || 'LinkedIn post',
    url: clean,
    source: 'linkedin-post',
    // The search already required the keyword to be on the page, so keep it matchable
    // even when the short snippet does not show it.
    tags: [keyword],
    description: hit.snippet,
    postedAt: parseRelativeDate(hit.date, now),
  };
}

/**
 * Finds public LinkedIn *posts* ("we're hiring ... Node.js") by searching Google's index
 * through a search API. It never touches LinkedIn itself and needs no LinkedIn account.
 *
 * Enable with ONE of:
 *   SERPER_API_KEY                      (serper.dev)
 *   GOOGLE_CSE_KEY + GOOGLE_CSE_CX      (Google Programmable Search)
 */
@Injectable()
export class LinkedinPostsSource implements JobSource {
  readonly name = 'linkedin-posts';
  private readonly logger = new Logger(LinkedinPostsSource.name);

  get intervalMinutes(): number {
    return int(process.env.LINKEDIN_POST_INTERVAL_MIN, 360);
  }

  isEnabled(): boolean {
    return !!(
      process.env.SERPER_API_KEY ||
      (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX)
    );
  }

  async fetch(): Promise<Job[]> {
    const keywords = list(process.env.LINKEDIN_POST_KEYWORDS, [
      'node.js',
      'nestjs',
    ]);
    const hiringTerms = list(process.env.LINKEDIN_POST_HIRING_TERMS, [
      'hiring',
      "we're hiring",
      'looking for',
      'join our team',
    ]);
    const locations = list(process.env.LINKEDIN_POST_LOCATIONS, []);
    const w = process.env.LINKEDIN_POST_WINDOW;
    const window: Window = w === 'd' || w === 'm' ? w : 'w';

    const jobs = new Map<string, Job>();
    for (const keyword of keywords) {
      const q = buildQuery(keyword, hiringTerms, locations);
      const hits = process.env.SERPER_API_KEY
        ? await this.serper(q, window)
        : await this.cse(q, window);
      for (const hit of hits) {
        const job = hitToJob(hit, keyword);
        if (job) jobs.set(job.id, job);
      }
      this.logger.debug(`"${keyword}": ${hits.length} hits`);
    }
    return [...jobs.values()];
  }

  private async serper(q: string, window: Window): Promise<RawHit[]> {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, num: 10, tbs: `qdr:${window}` }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 || res.status === 403)
      throw new Error('Serper rejected the API key (or out of credits)');
    if (!res.ok) throw new Error(`Serper -> HTTP ${res.status}`);
    return parseSerper(await res.json());
  }

  private async cse(q: string, window: Window): Promise<RawHit[]> {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', process.env.GOOGLE_CSE_KEY!);
    url.searchParams.set('cx', process.env.GOOGLE_CSE_CX!);
    url.searchParams.set('q', q);
    url.searchParams.set('num', '10');
    url.searchParams.set('dateRestrict', `${window}1`);
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 403 || res.status === 429)
      throw new Error(
        `Google CSE refused the request (HTTP ${res.status}): quota or key problem`,
      );
    if (!res.ok) throw new Error(`Google CSE -> HTTP ${res.status}`);
    return parseCse(await res.json());
  }
}
