import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

const KEY = 'owner:chatId';

/**
 * Who the bot talks to. The first chat that sends /start (with the pairing secret, if one is
 * configured) becomes the owner and is persisted in Redis, so no .env edit or restart is needed.
 * TELEGRAM_CHAT_ID in .env, if set, takes precedence.
 */
@Injectable()
export class OwnerService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  get pairingSecret(): string | undefined {
    return this.config.get<string>('telegram.pairingSecret');
  }

  get isFixedByEnv(): boolean {
    return !!this.config.get<string>('telegram.chatId');
  }

  async getChatId(): Promise<string | undefined> {
    return this.config.get<string>('telegram.chatId') || (await this.redis.get(KEY)) || undefined;
  }

  async requireChatId(): Promise<string> {
    const id = await this.getChatId();
    if (!id) throw new Error('Bot is not paired yet. Send /start to it in Telegram.');
    return id;
  }

  async claim(chatId: string): Promise<void> {
    await this.redis.set(KEY, chatId);
  }

  async release(): Promise<void> {
    await this.redis.del(KEY);
  }
}
