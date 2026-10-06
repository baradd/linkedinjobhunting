import * as cheerio from 'cheerio';
import { Job } from '../job.interface';

const BUTTON_TEXT = /^(view job|view jobs|apply|apply now|see all jobs|see more jobs|unsubscribe)/i;

/**
 * Best-effort parser for LinkedIn "job alert" emails.
 *
 * LinkedIn changes this markup from time to time, so the parser is intentionally
 * defensive: it looks for links to /jobs/view/<id>, takes the link text as the
 * title, and then reads the next text lines in the surrounding table cell as
 * "company" and "location" (also handles the "Company · Location" form).
 * If LinkedIn changes the layout, this is the only file you need to adjust.
 */
export function parseLinkedInAlertHtml(html: string, receivedAt: Date = new Date()): Job[] {
  const $ = cheerio.load(html);
  const jobs = new Map<string, Job>();

  $('a[href*="/jobs/view/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/);
    if (!m) return;
    const jobId = m[1];
    if (jobs.has(jobId)) return;

    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (title.length < 3 || BUTTON_TEXT.test(title)) return;

    let company = '';
    let location = '';

    // Walk up a few ancestors until we find text lines after the title.
    let node = $(el).closest('td, li, div');
    for (let depth = 0; depth < 4 && node.length; depth++) {
      const lines = node
        .text()
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const idx = lines.findIndex((l) => l === title);
      if (idx >= 0 && lines.length > idx + 1) {
        const first = lines[idx + 1];
        if (first.includes(' · ')) {
          const [c, ...rest] = first.split(' · ');
          company = c.trim();
          location = rest.join(' · ').trim();
        } else {
          company = first;
          location = lines[idx + 2] ?? '';
        }
        break;
      }
      node = node.parent().closest('td, li, div');
    }

    jobs.set(jobId, {
      id: `linkedin:${jobId}`,
      title,
      company: company || 'Unknown company',
      location: location || undefined,
      remote: /remote/i.test(location) || /\(remote\)/i.test(title),
      url: `https://www.linkedin.com/jobs/view/${jobId}`,
      source: 'linkedin',
      postedAt: receivedAt,
    });
  });

  return [...jobs.values()];
}
