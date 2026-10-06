import { escapeHtml } from '../common/text.util';
import { Job } from '../jobs/job.interface';

export function formatJob(job: Job): string {
  const lines = [`💼 <b>${escapeHtml(job.title)}</b>`, `🏢 ${escapeHtml(job.company)}`];
  const place = [job.location, job.remote && !/remote/i.test(job.location ?? '') ? 'Remote' : '']
    .filter(Boolean)
    .join(' · ');
  if (place) lines.push(`📍 ${escapeHtml(place)}`);
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
