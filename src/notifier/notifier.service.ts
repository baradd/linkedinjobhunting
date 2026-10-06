import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { sleep } from '../common/text.util';
import { Job } from '../jobs/job.interface';
import { OwnerService } from '../settings/owner.service';
import { formatJob } from './format';

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly owner: OwnerService,
  ) {}

  async sendJob(job: Job): Promise<void> {
    const chatId = await this.owner.requireChatId();
    const keyboard = Markup.inlineKeyboard([Markup.button.url('Open posting', job.url)]);
    await this.withRetry(() =>
      this.bot.telegram.sendMessage(chatId, formatJob(job), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard.reply_markup,
      }),
    );
  }

  async sendHtml(text: string): Promise<void> {
    const chatId = await this.owner.requireChatId();
    await this.withRetry(() =>
      this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    );
  }

  /** Telegram answers 429 with retry_after; wait once and retry. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const retryAfter = (err as { response?: { parameters?: { retry_after?: number } } })?.response
        ?.parameters?.retry_after;
      if (retryAfter) {
        this.logger.warn(`Rate limited by Telegram, waiting ${retryAfter}s`);
        await sleep((retryAfter + 1) * 1000);
        return fn();
      }
      throw err;
    }
  }
}
