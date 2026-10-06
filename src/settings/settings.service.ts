import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface Settings {
  keywords: string[];
  excludes: string[];
  /** Location substrings, e.g. "yerevan", "armenia". Empty = no location filter. */
  locations: string[];
  /** When a location filter is set, still let remote jobs through. */
  includeRemote: boolean;
  paused: boolean;
}

const KEY = 'settings';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  private defaults(): Settings {
    return {
      keywords: [...this.config.getOrThrow<string[]>('jobs.defaultKeywords')],
      excludes: [...this.config.getOrThrow<string[]>('jobs.defaultExcludes')],
      locations: [],
      includeRemote: true,
      paused: false,
    };
  }

  async get(): Promise<Settings> {
    const raw = await this.redis.get(KEY);
    return { ...this.defaults(), ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
  }

  async update(mutate: (s: Settings) => void): Promise<Settings> {
    const current = await this.get();
    mutate(current);
    await this.redis.set(KEY, JSON.stringify(current));
    return current;
  }
}
