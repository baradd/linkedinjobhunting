import { escapeHtml } from '../common/text.util';
import { Job } from '../jobs/job.interface';

export function formatJob(job: Job): string {
  const lines = [
    `💼 <b>${escapeHtml(job.title)}</b>`,
    `🏢 ${escapeHtml(job.company)}`,
  ];
  const place = [
    job.location,
    job.remote && !/remote/i.test(job.location ?? '') ? 'Remote' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (place) lines.push(`📍 ${escapeHtml(place)}`);
  if (job.source === 'linkedin-post' && job.description) {
    const snippet = job.description.replace(/\s+/g, ' ').trim();
    lines.push(
      `<i>${escapeHtml(snippet.length > 240 ? snippet.slice(0, 237) + '…' : snippet)}</i>`,
    );
  }
  const meta = [`via ${job.source}`];
  if (job.postedAt && !Number.isNaN(job.postedAt.getTime())) {
    meta.push(job.postedAt.toISOString().slice(0, 10));
  }
  lines.push(`🕒 ${escapeHtml(meta.join(' · '))}`);
  return lines.join('\n');
}

export function formatJobLine(job: Job): string {
  return `• <a href="${escapeHtml(job.url)}">${escapeHtml(job.title)}</a> (${escapeHtml(job.company)}, ${escapeHtml(job.source)})`;
}
