import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Command, Ctx, Help, InjectBot, Next, Start, Update, Use } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { escapeHtml } from '../common/text.util';
import { JobsService } from '../jobs/jobs.service';
import { formatJobLine } from '../notifier/format';
import { OwnerService } from '../settings/owner.service';
import { SettingsService } from '../settings/settings.service';

const HELP = `<b>Node.js job alerts</b>

<b>Filters</b>
/keywords: show current filters
/add node.js, nestjs: add keyword(s)
/remove react: remove keyword(s)
/exclude intern, senior: ignore titles containing these
/unexclude intern
/location yerevan: only these locations (repeat to add more)
/unlocation yerevan
/remote on|off: with a location filter, still show remote jobs

<b>Control</b>
/check: poll all sources now
/recent: last 10 alerts
/status: sources and last run
/pause · /resume\n/unpair: release this chat so another can pair`;

const parseList = (arg: string): string[] =>
  arg
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const argOf = (ctx: Context): string => {
  const text = (ctx.message as { text?: string } | undefined)?.text ?? '';
  return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
};

const html = (ctx: Context, text: string) =>
  ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });

@Update()
export class BotUpdate implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly owner: OwnerService,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'keywords', description: 'Show current filters' },
        { command: 'check', description: 'Poll all sources now' },
        { command: 'recent', description: 'Last 10 alerts' },
        { command: 'status', description: 'Sources and last run' },
        { command: 'pause', description: 'Pause alerts' },
        { command: 'resume', description: 'Resume alerts' },
        { command: 'help', description: 'All commands' },
      ]);
    } catch (err) {
      this.logger.warn(`Could not set bot commands: ${(err as Error).message}`);
    }
  }

  /**
   * Only the owner chat may talk to the bot. While unpaired, the first private /start
   * (with the pairing secret, if one is configured) claims the bot. Stored in Redis, no restart needed.
   */
  @Use()
  async guard(@Ctx() ctx: Context, @Next() next: () => Promise<void>): Promise<void> {
    const id = String(ctx.chat?.id ?? '');
    const owner = await this.owner.getChatId();

    if (owner) {
      if (id === owner) await next();
      return;
    }

    if (ctx.chat?.type !== 'private') return;
    const text = (ctx.message as { text?: string } | undefined)?.text ?? '';
    const m = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/);
    if (!m) {
      await html(ctx, 'Send /start to pair this bot with your chat.');
      return;
    }
    const secret = this.owner.pairingSecret;
    if (secret && m[1] !== secret) {
      await html(ctx, 'This bot needs a pairing secret: <code>/start &lt;secret&gt;</code>');
      return;
    }
    await this.owner.claim(id);
    this.logger.log(`Paired with chat ${id}`);
    await html(ctx, `✅ Paired. I'll send Node.js job alerts here.\n\n${HELP}`);
  }

  @Start()
  async start(@Ctx() ctx: Context) {
    await html(ctx, HELP);
  }

  @Help()
  async help(@Ctx() ctx: Context) {
    await html(ctx, HELP);
  }

  @Command('keywords')
  async keywords(@Ctx() ctx: Context) {
    const s = await this.settings.get();
    const lines = [
      `<b>Keywords</b>: ${s.keywords.map(escapeHtml).join(', ') || '(none)'}`,
      `<b>Excluded</b>: ${s.excludes.map(escapeHtml).join(', ') || '(none)'}`,
      `<b>Locations</b>: ${s.locations.map(escapeHtml).join(', ') || '(any)'}`,
      `<b>Include remote</b>: ${s.includeRemote ? 'yes' : 'no'}`,
      `<b>State</b>: ${s.paused ? '⏸ paused' : '▶️ running'}`,
    ];
    await html(ctx, lines.join('\n'));
  }

  @Command('add')
  async add(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/add node.js, nestjs</code>');
    const s = await this.settings.update((x) => {
      x.keywords = [...new Set([...x.keywords, ...items])];
    });
    await html(ctx, `Keywords: ${s.keywords.map(escapeHtml).join(', ')}`);
  }

  @Command('remove')
  async remove(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/remove react</code>');
    const s = await this.settings.update((x) => {
      x.keywords = x.keywords.filter((k) => !items.includes(k));
    });
    await html(ctx, `Keywords: ${s.keywords.map(escapeHtml).join(', ') || '(none)'}`);
  }

  @Command('exclude')
  async exclude(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/exclude intern, senior</code>');
    const s = await this.settings.update((x) => {
      x.excludes = [...new Set([...x.excludes, ...items])];
    });
    await html(ctx, `Excluded: ${s.excludes.map(escapeHtml).join(', ')}`);
  }

  @Command('unexclude')
  async unexclude(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/unexclude intern</code>');
    const s = await this.settings.update((x) => {
      x.excludes = x.excludes.filter((k) => !items.includes(k));
    });
    await html(ctx, `Excluded: ${s.excludes.map(escapeHtml).join(', ') || '(none)'}`);
  }

  @Command('location')
  async location(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/location yerevan, armenia</code>');
    const s = await this.settings.update((x) => {
      x.locations = [...new Set([...x.locations, ...items])];
    });
    await html(ctx, `Locations: ${s.locations.map(escapeHtml).join(', ')}`);
  }

  @Command('unlocation')
  async unlocation(@Ctx() ctx: Context) {
    const items = parseList(argOf(ctx));
    if (!items.length) return html(ctx, 'Usage: <code>/unlocation yerevan</code>');
    const s = await this.settings.update((x) => {
      x.locations = x.locations.filter((k) => !items.includes(k));
    });
    await html(ctx, `Locations: ${s.locations.map(escapeHtml).join(', ') || '(any)'}`);
  }

  @Command('remote')
  async remote(@Ctx() ctx: Context) {
    const arg = argOf(ctx).toLowerCase();
    if (arg !== 'on' && arg !== 'off') return html(ctx, 'Usage: <code>/remote on</code> or <code>/remote off</code>');
    await this.settings.update((x) => {
      x.includeRemote = arg === 'on';
    });
    await html(ctx, `Include remote jobs: <b>${arg}</b>`);
  }

  @Command('unpair')
  async unpair(@Ctx() ctx: Context) {
    if (this.owner.isFixedByEnv) {
      return html(ctx, 'The chat is fixed by <code>TELEGRAM_CHAT_ID</code> in .env, remove it there to unpair.');
    }
    await this.owner.release();
    await html(ctx, '🔓 Unpaired. The next chat that sends /start will become the owner.');
  }

  @Command('pause')
  async pause(@Ctx() ctx: Context) {
    await this.settings.update((x) => {
      x.paused = true;
    });
    await html(ctx, '⏸ Alerts paused. /resume to continue.');
  }

  @Command('resume')
  async resume(@Ctx() ctx: Context) {
    await this.settings.update((x) => {
      x.paused = false;
    });
    await html(ctx, '▶️ Alerts resumed.');
  }

  @Command('check')
  async check(@Ctx() ctx: Context) {
    await html(ctx, '🔎 Checking all sources…');
    const r = await this.jobs.poll(true);
    if (r.skipped) return html(ctx, `Skipped (${r.skipped}).`);
    const fetched =
      Object.entries(r.fetched)
        .map(([k, v]) => `${escapeHtml(k)}: ${v}`)
        .join(', ') || 'no source ran';
    const lines = [`Fetched → ${fetched}`, `Matching filters: ${r.matched}`, `New alerts sent: ${r.sent}`];
    if (r.errors.length) lines.push(`⚠️ Errors:\n${r.errors.map((e) => `• ${escapeHtml(e)}`).join('\n')}`);
    await html(ctx, lines.join('\n'));
  }

  @Command('recent')
  async recent(@Ctx() ctx: Context) {
    const jobs = await this.jobs.recent(10);
    if (!jobs.length) return html(ctx, 'No alerts yet.');
    await html(ctx, jobs.map(formatJobLine).join('\n'));
  }

  @Command('status')
  async status(@Ctx() ctx: Context) {
    const [s, sources] = await Promise.all([this.settings.get(), this.jobs.status()]);
    const lines = sources.map((x) => {
      const state = x.enabled ? '✅' : '⛔ disabled';
      const last = x.lastRun ? x.lastRun.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never';
      return `${state} <b>${escapeHtml(x.name)}</b>: every ${x.intervalMinutes} min, last run ${last}`;
    });
    await html(ctx, `${s.paused ? '⏸ paused' : '▶️ running'}\n${lines.join('\n')}`);
  }
}
