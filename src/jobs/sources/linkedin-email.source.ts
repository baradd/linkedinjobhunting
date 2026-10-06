import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Job, JobSource } from '../job.interface';
import { parseLinkedInAlertHtml } from './linkedin-email.parser';

/**
 * Reads LinkedIn job-alert emails from a mailbox over IMAP.
 * This is the ToS-safe way to get LinkedIn jobs: you create the alert in LinkedIn,
 * LinkedIn emails it to you, and the bot just reads your own mailbox.
 * Processed emails are flagged as read so they are never parsed twice.
 */
@Injectable()
export class LinkedinEmailSource implements JobSource {
  readonly name = 'linkedin';
  readonly intervalMinutes: number;
  private readonly logger = new Logger(LinkedinEmailSource.name);

  constructor(private readonly config: ConfigService) {
    this.intervalMinutes = config.getOrThrow<number>('sources.emailIntervalMin');
  }

  isEnabled(): boolean {
    return !!(
      this.config.get('imap.host') &&
      this.config.get('imap.user') &&
      this.config.get('imap.pass')
    );
  }

  async fetch(): Promise<Job[]> {
    const client = new ImapFlow({
      host: this.config.getOrThrow<string>('imap.host'),
      port: this.config.getOrThrow<number>('imap.port'),
      secure: true,
      auth: {
        user: this.config.getOrThrow<string>('imap.user'),
        pass: this.config.getOrThrow<string>('imap.pass'),
      },
      logger: false,
    });
    client.on('error', (err: Error) => this.logger.warn(`IMAP error: ${err.message}`));

    const jobs: Job[] = [];
    await client.connect();
    try {
      const lock = await client.getMailboxLock(this.config.getOrThrow<string>('imap.folder'));
      try {
        const uids =
          (await client.search(
            { seen: false, from: this.config.getOrThrow<string>('imap.from') },
            { uid: true },
          )) || [];

        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;

          const parsed = await simpleParser(msg.source);
          const html = typeof parsed.html === 'string' ? parsed.html : '';
          const found = parseLinkedInAlertHtml(html, parsed.date ?? new Date());
          if (found.length === 0) {
            this.logger.warn(
              `No jobs parsed from email "${parsed.subject ?? '(no subject)'}": LinkedIn layout may have changed.`,
            );
          }
          jobs.push(...found);
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return jobs;
  }
}
