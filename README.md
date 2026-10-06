# LinkedIn Job Bot (NestJS + Telegram)

A Telegram bot that watches for **Node.js / NestJS job postings** and sends them to you.

## Why it doesn't scrape LinkedIn

LinkedIn has no public API for reading jobs or feed posts, and scraping it violates their ToS
(accounts used for it get restricted). So this bot gets LinkedIn jobs the safe way:

1. You create **LinkedIn Job Alerts** (they arrive by email).
2. The bot reads those emails from **your own mailbox over IMAP** and parses the jobs.

On top of that it polls free job-board APIs, so you are not limited to LinkedIn.

| Source | What it gives you | Default interval |
|---|---|---|
| `linkedin` (IMAP) | Jobs from your LinkedIn alert emails | 10 min |
| `remotive` | Remote software jobs | 6 h (their API is rate-limited) |
| `arbeitnow` | Europe-focused jobs, many with relocation/visa support | 30 min |

> Limitation: LinkedIn *feed posts* ("we're hiring!" posts by people) are not available from any
> legitimate source. The bot covers job listings.

## Architecture

```
@Cron every minute
  └─ JobsService.poll()
       ├─ sources (each respects its own interval): LinkedinEmailSource · RemotiveSource · ArbeitnowSource
       ├─ drop old postings (MAX_AGE_DAYS)
       ├─ filter: keywords / excludes / locations / remote   (settings live in Redis, editable from Telegram)
       ├─ dedupe in Redis: by posting id AND by title+company (same job on two sources)
       └─ NotifierService → Telegram message with an "Open posting" button
```

On the very first run the bot sends only the 5 newest matches and silently marks the rest as seen,
so you don't get flooded.

## Setup

### 1. Create the bot
Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.

### 2. Configure
```bash
cp .env.example .env
# put TELEGRAM_BOT_TOKEN in .env
```

### 3. Start it and pair
```bash
docker compose up -d --build        # or: npm install && npm run start:dev  (needs a local Redis)
```
Open your bot in Telegram and send `/start`. That's it: the chat is paired and remembered in Redis,
no `.env` edit and no restart. Until it is paired the bot sends nothing.

Recommended: set `BOT_PAIRING_SECRET` in `.env` (any random word). Then pair with `/start <secret>`
(or the link `https://t.me/<your_bot>?start=<secret>`), so nobody else who finds the bot can claim it first.
Use `/unpair` to release the bot and pair a different chat. `TELEGRAM_CHAT_ID` still works if you prefer to pin it.

### 4. Connect LinkedIn (recommended)
1. On LinkedIn: **Jobs** → search `Node.js` (add location/filters) → toggle **Set alert** →
   choose **email** notifications. Repeat for `NestJS`, `Backend Developer`, etc.
2. Make sure those emails land in a mailbox you can read over IMAP.
3. Fill `IMAP_*` in `.env`. For Gmail: `IMAP_HOST=imap.gmail.com`, `IMAP_PORT=993`, and use an
   **App Password** (Google Account → Security → 2-Step Verification → App passwords). Don't use your real password.
4. Restart. Send `/check` to test.

Processed emails are marked as read, so each one is parsed once.

## Telegram commands

| Command | What it does |
|---|---|
| `/keywords` | Show current filters |
| `/add node.js, nestjs` | Add keyword(s) |
| `/remove react` | Remove keyword(s) |
| `/exclude intern, senior` | Ignore titles containing these words |
| `/unexclude intern` | Undo |
| `/location yerevan` | Only these locations (repeat to add more) |
| `/unlocation yerevan` | Remove a location |
| `/remote on\|off` | With a location filter, still allow remote jobs |
| `/check` | Poll all sources right now |
| `/recent` | Last 10 alerts |
| `/status` | Sources and last run |
| `/pause` · `/resume` | Stop / start alerts |
| `/unpair` | Release the bot so another chat can pair |

Keywords match whole words (`node` matches "Node/React", not "nodes"). By default they are matched
against title + tags + the first 1500 characters of the description (`MATCH_DESCRIPTION=false` to use title + tags only).

## Development

```bash
npm install
npm run start:dev     # needs Redis: docker run -p 6379:6379 redis:7-alpine
npm test              # filter + LinkedIn email parser tests
```

## Adding another source

1. Create `src/jobs/sources/my-source.source.ts` implementing `JobSource`
   (`name`, `intervalMinutes`, `isEnabled()`, `fetch(): Promise<Job[]>`).
2. Add it to `providers` and to `inject` in `src/jobs/jobs.module.ts`.

That's it. Filtering, dedupe, scheduling and notifications are shared.

## If LinkedIn alerts stop being parsed

LinkedIn changes its email HTML occasionally. The parser (`src/jobs/sources/linkedin-email.parser.ts`)
is best-effort and logs `No jobs parsed from email ...` when it finds nothing. Job titles and links are
reliable (it looks for `/jobs/view/<id>` links); company and location come from the text next to the title and
may need a small tweak. Add a real email's HTML to `linkedin-email.parser.spec.ts` and adjust.

## Notes

- Redis keeps settings, the "seen" set (60 days) and the last 50 alerts. Use the included volume to persist it.
- Be nice to the free APIs: don't lower `REMOTIVE_INTERVAL_MIN` much.
