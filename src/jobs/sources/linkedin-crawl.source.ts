import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { sleep } from '../../common/text.util';
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

/** Parses the HTML fragment returned by LinkedIn's public guest search endpoint. */
export function parseLinkedInSearchHtml(html: string): Job[] {
  const $ = cheerio.load(html);
  const jobs = new Map<string, Job>();

  $('li').each((_, li) => {
    const card = $(li);
    const link =
      card.find('a.base-card__full-link').attr('href') ??
      card.find('a[href*="/jobs/view/"]').first().attr('href') ??
      '';
    const urn = card.find('[data-entity-urn]').attr('data-entity-urn') ?? '';
    const id =
      urn.match(/jobPosting:(\d+)/)?.[1] ??
      link.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/)?.[1];
    if (!id || jobs.has(id)) return;

    const title = (
      card.find('.base-search-card__title').text() ||
      card.find('h3').first().text()
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) return;

    const company = (
      card.find('.base-search-card__subtitle').text() ||
      card.find('h4').first().text()
    )
      .replace(/\s+/g, ' ')
      .trim();
    const location = card
      .find('.job-search-card__location')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const datetime = card.find('time').attr('datetime');
    const postedAt = datetime ? new Date(datetime) : undefined;

    jobs.set(id, {
      // same id format as the email source, so a job found by both is only sent once
      id: `linkedin:${id}`,
      title,
      company: company || 'Unknown company',
      location: location || undefined,
      remote: /remote/i.test(location) || /remote/i.test(title),
      url: `https://www.linkedin.com/jobs/view/${id}`,
      source: 'linkedin',
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    });
  });

  return [...jobs.values()];
}

/**
 * OPTIONAL, opt-in (LINKEDIN_CRAWL=true). Uses LinkedIn's public *guest* job-search endpoint:
 * no login, no cookies. This is against LinkedIn's ToS and LinkedIn blocks it regularly, so it is
 * deliberately slow and backs off for 6 hours as soon as it is blocked.
 */
@Injectable()
export class LinkedinCrawlSource implements JobSource {
  readonly name = 'linkedin-web';
  private readonly logger = new Logger(LinkedinCrawlSource.name);
  private blockedUntil = 0;

  get intervalMinutes(): number {
    return int(process.env.LINKEDIN_CRAWL_INTERVAL_MIN, 60);
  }

  isEnabled(): boolean {
    return process.env.LINKEDIN_CRAWL === 'true';
  }

  async fetch(): Promise<Job[]> {
    if (Date.now() < this.blockedUntil) return [];

    const keywords = list(process.env.LINKEDIN_KEYWORDS, ['node.js', 'nestjs']);
    const locations = list(process.env.LINKEDIN_LOCATIONS, ['Armenia']);
    const pages = Math.min(int(process.env.LINKEDIN_PAGES, 1), 3);
    const windowSeconds = int(process.env.LINKEDIN_WINDOW_SECONDS, 86_400);

    const jobs = new Map<string, Job>();
    let firstRequest = true;

    for (const keyword of keywords) {
      for (const location of locations) {
        let start = 0;
        for (let page = 0; page < pages; page++) {
          if (!firstRequest) await sleep(2500 + Math.random() * 2500); // be polite
          firstRequest = false;

          const url = new URL(
            'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',
          );
          url.searchParams.set('keywords', keyword);
          url.searchParams.set('location', location);
          url.searchParams.set('f_TPR', `r${windowSeconds}`);
          url.searchParams.set('sortBy', 'DD');
          url.searchParams.set('start', String(start));

          const res = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(20_000),
          });

          if ([403, 429, 999].includes(res.status)) {
            this.blockedUntil = Date.now() + 6 * 3_600_000;
            throw new Error(
              `LinkedIn blocked the crawler (HTTP ${res.status}). Pausing this source for 6h.`,
            );
          }
          if (!res.ok) throw new Error(`LinkedIn search -> HTTP ${res.status}`);

          const found = parseLinkedInSearchHtml(await res.text());
          if (found.length === 0) {
            this.logger.debug(
              `No results for "${keyword}" in "${location}" (page ${page + 1})`,
            );
            break;
          }
          found.forEach((j) => jobs.set(j.id, j));
          start += found.length;
        }
      }
    }
    return [...jobs.values()];
  }
}
