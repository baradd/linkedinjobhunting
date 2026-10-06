const int = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const list = (value: string | undefined, fallback: string[]): string[] => {
  if (value === undefined) return fallback;
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

export default () => ({
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID?.trim() || undefined,
    pairingSecret: process.env.BOT_PAIRING_SECRET?.trim() || undefined,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jobs: {
    defaultKeywords: list(process.env.DEFAULT_KEYWORDS, ['node.js', 'nodejs', 'node', 'nestjs']),
    defaultExcludes: list(process.env.DEFAULT_EXCLUDES, ['intern', 'internship']),
    maxAgeDays: int(process.env.MAX_AGE_DAYS, 7),
    matchDescription: (process.env.MATCH_DESCRIPTION ?? 'true') !== 'false',
  },
  sources: {
    remotiveIntervalMin: int(process.env.REMOTIVE_INTERVAL_MIN, 360),
    arbeitnowIntervalMin: int(process.env.ARBEITNOW_INTERVAL_MIN, 30),
    emailIntervalMin: int(process.env.EMAIL_INTERVAL_MIN, 10),
  },
  imap: {
    host: process.env.IMAP_HOST || undefined,
    port: int(process.env.IMAP_PORT, 993),
    user: process.env.IMAP_USER || undefined,
    pass: process.env.IMAP_PASS || undefined,
    folder: process.env.IMAP_FOLDER || 'INBOX',
    from: process.env.IMAP_FROM || 'jobalerts-noreply@linkedin.com',
  },
});
