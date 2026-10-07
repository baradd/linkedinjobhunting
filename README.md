# Job Alert Bot

A self-hosted **Telegram bot** that watches several job sources for **Node.js / NestJS** roles and
sends new matches straight to your chat. Built with NestJS, TypeScript, Telegraf and Redis.

> Status: early-stage personal project, open to ideas and contributions (see [Roadmap](#roadmap)).

## Features

- Collects jobs from several sources on their own schedules (see [Sources](#sources))
- Filters by **keywords**, **excluded words**, **location** and **remote**, all editable from Telegram, no redeploy
- Never sends the same job twice, even when it shows up on two sources
- Pairs itself with your chat on the first `/start`, so no chat ID in `.env` and no restart
- Sources are isolated: one failing source never stops the others
- Easy to extend: a new source is one small class

## Sources

| Source             | What it finds                                                                           | Setup                    | Default interval |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------ | ---------------- |
| `linkedin` (email) | Jobs from your own **LinkedIn job-alert emails**, read over IMAP                        | IMAP login               | 10 min           |
| `linkedin-posts`   | Public LinkedIn **posts** like "we're hiring a Node.js dev", found through a search API | Serper or Google CSE key | 6 h              |
| `remotive`         | Remote software jobs                                                                    | none                     | 6 h              |
| `arbeitnow`        | Europe-focused jobs, many with relocation support                                       | none                     | 30 min           |
| `linkedin-web`     | _Experimental, off by default._ See the warning below                                   | `LINKEDIN_CRAWL=true`    | 60 min           |

Notes:

- LinkedIn has no public API for reading jobs or posts. The email and search-API routes are the
  recommended way to get LinkedIn data: they never touch LinkedIn or need your LinkedIn login.
- `linkedin-posts` only sees public posts that Google has indexed. Expect a delay of hours to days
  and incomplete coverage. Treat it as a bonus source.
- **`linkedin-web` warning:** it queries LinkedIn's public guest job search. That is against
  LinkedIn's Terms of Service and LinkedIn blocks it regularly. It never logs in, is deliberately slow,
  and pauses itself for 6 hours when blocked. It is off by default. Enable it only at your own risk,
  and never add account cookies to it.

## How it works

```
@Cron every minute
  └─ JobsService.poll()
       ├─ sources (each respects its own interval)
       ├─ drop old postings (MAX_AGE_DAYS)
       ├─ filter: keywords / excludes / location / remote   (settings live in Redis)
       ├─ dedupe in Redis: by posting id AND by title + company
       └─ NotifierService → Telegram message with an "Open posting" button
```

On the very first run the bot sends only the 5 newest matches and silently marks the rest as seen,
so you are not flooded. A source that fails is retried after about 10 minutes, not every minute.

## Quick start

### 1. Create the bot

Talk to [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.

### 2. Configure

```bash
cp .env.example .env
# put TELEGRAM_BOT_TOKEN in .env
```

### 3. Start it and pair

```bash
docker compose up -d --build     # or: npm install && npm run start:dev (needs a local Redis)
```

Open your bot in Telegram and send `/start`. The chat is paired and remembered in Redis, with no
restart needed. Until it is paired the bot sends nothing.

Recommended: set `BOT_PAIRING_SECRET` in `.env` (any random word) and pair with `/start <secret>`, or
open `https://t.me/<your_bot>?start=<secret>`. Then nobody else who finds the bot can claim it first.
`/unpair` releases the bot. `TELEGRAM_CHAT_ID` still works if you prefer to pin the chat.

### 4. Turn on the sources you want

**LinkedIn job-alert emails (recommended)**

1. On LinkedIn: **Jobs**, search `Node.js` (add location and filters), switch on **Set alert** and
   choose email. Repeat for `NestJS`, `Backend Developer`, and so on.
2. For Gmail, enable IMAP and create an **App Password** (Google Account, Security, App passwords).
3. Fill in the `IMAP_*` variables and restart. Send `/check` to test.

Processed emails are marked as read, so each one is parsed once. If `IMAP_FROM` does not match the
sender of your alert emails, change it.

**LinkedIn posts (search API)**
Set one of `SERPER_API_KEY` (serper.dev) or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` (Google Programmable
Search, restricted to `linkedin.com/posts/*`). Free tiers are enough at the default interval.
Check each provider's current limits.

**Disable a source** you don't want or that blocks you:

```
DISABLE_SOURCES=arbeitnow
```

## Telegram commands

| Command                   | What it does                                    |
| ------------------------- | ----------------------------------------------- |
| `/keywords`               | Show current filters                            |
| `/add node.js, nestjs`    | Add keyword(s)                                  |
| `/remove react`           | Remove keyword(s)                               |
| `/exclude intern, senior` | Ignore titles containing these words            |
| `/unexclude intern`       | Undo                                            |
| `/location yerevan`       | Only these locations (repeat to add more)       |
| `/unlocation yerevan`     | Remove a location                               |
| `/remote on\|off`         | With a location filter, still allow remote jobs |
| `/check`                  | Poll all sources right now                      |
| `/recent`                 | Last 10 alerts                                  |
| `/status`                 | Sources and last run                            |
| `/pause` · `/resume`      | Stop / start alerts                             |
| `/unpair`                 | Release the bot so another chat can pair        |

Keywords match whole words (`node` matches "Node/React", not "nodes"). They are matched against title,
tags and the first 1500 characters of the description (`MATCH_DESCRIPTION=false` for title and tags
only). A job with no known location is never dropped by the location filter.

## Configuration

| Variable                                                                     | Default                                         | Description                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`                                                         | required                                        | Token from @BotFather                                  |
| `TELEGRAM_CHAT_ID`                                                           | empty                                           | Optional: pin the bot to one chat instead of pairing   |
| `BOT_PAIRING_SECRET`                                                         | empty                                           | Optional secret required to pair (`/start <secret>`)   |
| `REDIS_URL`                                                                  | `redis://localhost:6379`                        | Redis connection                                       |
| `DEFAULT_KEYWORDS`                                                           | `node.js,nodejs,node,nestjs`                    | Initial keywords (change later with `/add`, `/remove`) |
| `DEFAULT_EXCLUDES`                                                           | `intern,internship`                             | Initial excluded words                                 |
| `MAX_AGE_DAYS`                                                               | `7`                                             | Ignore postings older than this                        |
| `MATCH_DESCRIPTION`                                                          | `true`                                          | Also match keywords in the description                 |
| `DISABLE_SOURCES`                                                            | empty                                           | Comma-separated source names to turn off               |
| `REMOTIVE_INTERVAL_MIN`                                                      | `360`                                           | Minutes between Remotive fetches                       |
| `ARBEITNOW_INTERVAL_MIN`                                                     | `30`                                            | Minutes between Arbeitnow fetches                      |
| `EMAIL_INTERVAL_MIN`                                                         | `10`                                            | Minutes between mailbox checks                         |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASS`                        | empty / `993`                                   | LinkedIn alert mailbox (the source is off until set)   |
| `IMAP_FOLDER` / `IMAP_FROM`                                                  | `INBOX` / `jobalerts-noreply@linkedin.com`      | Folder and sender to read                              |
| `SERPER_API_KEY`                                                             | empty                                           | Enables `linkedin-posts` through serper.dev            |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX`                                           | empty                                           | Enables `linkedin-posts` through Google CSE            |
| `LINKEDIN_POST_KEYWORDS`                                                     | `node.js,nestjs`                                | What to search in posts                                |
| `LINKEDIN_POST_LOCATIONS`                                                    | empty                                           | Optional location words added to the post search       |
| `LINKEDIN_POST_HIRING_TERMS`                                                 | `hiring,we're hiring,looking for,join our team` | Hiring phrases to require                              |
| `LINKEDIN_POST_WINDOW`                                                       | `w`                                             | `d` day, `w` week, `m` month                           |
| `LINKEDIN_POST_INTERVAL_MIN`                                                 | `360`                                           | Minutes between post searches                          |
| `LINKEDIN_CRAWL`                                                             | `false`                                         | Turn on the experimental `linkedin-web` source         |
| `LINKEDIN_KEYWORDS` / `LINKEDIN_LOCATIONS`                                   | `node.js,nestjs` / `Armenia`                    | Searches for `linkedin-web`                            |
| `LINKEDIN_PAGES` / `LINKEDIN_WINDOW_SECONDS` / `LINKEDIN_CRAWL_INTERVAL_MIN` | `1` / `86400` / `60`                            | `linkedin-web` paging, age window and interval         |

## Development

```bash
npm install
npm run start:dev     # needs Redis: docker run -p 6379:6379 redis:7-alpine
npm test              # filters, parsers, pairing guard and dependency-injection wiring
```

### Adding a source

1. Create `src/jobs/sources/my-source.source.ts` implementing `JobSource`
   (`name`, `intervalMinutes`, `isEnabled()`, `fetch(): Promise<Job[]>`).
2. Add it to `providers` and `inject` in `src/jobs/jobs.module.ts`.

Filtering, dedupe, scheduling and notifications are shared. Put parsing in a pure exported function
so it can be unit-tested with a sample response.

## Troubleshooting

- **`setMyCommands failed` / the bot never replies:** your machine cannot reach `api.telegram.org`.
  Test with `curl https://api.telegram.org/bot<TOKEN>/getMe`. If Telegram is blocked, use a VPN, or route
  the bot through a proxy with an HTTP agent (`https-proxy-agent`) in `TelegrafModule`.
- **A source returns HTTP 403:** the site blocks your IP or client. Disable it with `DISABLE_SOURCES`.
- **LinkedIn emails arrive but no jobs show up:** look for `No jobs parsed from email...` in the logs.
  LinkedIn changes its email layout occasionally, so adjust `linkedin-email.parser.ts` and add a sample to
  its spec.
- **Fewer jobs than expected:** check `/keywords`. Keywords, excludes and locations all filter every source.

## Roadmap

Ideas I plan to work on, in rough order:

- [ ] Upload your resume and **score each job against it** (match percentage plus missing skills)
- [ ] **Find recruiters** at a job's company and **draft** a personalized message to send them
- [ ] Employment-type filter (full-time, contract, part-time) and salary or seniority filters
- [ ] Fetch full job descriptions so matching is not limited to titles
- [ ] More sources (Hacker News "Who is hiring", Wellfound, company career pages)
- [ ] Daily or weekly digest instead of one message per job
- [ ] Multi-user support and a small web dashboard

## Contributing

Ideas, bug reports and pull requests are all welcome.

- Open an issue to discuss a new source or feature before a large PR.
- Keep sources isolated and polite: respect rate limits and the site's terms.
- Add a unit test for any parser or filter change (`npm test` must pass).
- Do not add code that logs in to a third-party site with someone's account or sends messages
  automatically.

## Disclaimer

This is a personal tool, not affiliated with LinkedIn, Telegram or any job board. Respect the terms of
service of every source you enable. Job data belongs to its respective sources.

## License

MIT. Add a `LICENSE` file and set `"license": "MIT"` in `package.json`.
