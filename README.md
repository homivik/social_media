# Twitter OpenRouter Bot

Node.js bot that monitors configured Twitter accounts, generates contextual replies with OpenRouter, and posts replies on a schedule.

## Features

- Fetches recent tweets for configured accounts
- Applies ordered safety filters (duplicate, engagement, cooldown, daily cap)
- Generates replies with OpenRouter (`model=auto` by default)
- Supports dry-run mode for safe testing
- Tracks posted replies and cost in SQLite
- Runs on a GitHub Actions cron schedule

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Fill required variables in `.env`:
   - `TWITTER_BEARER_TOKEN` (app Bearer — used for **recent search**)
   - `OPENROUTER_API_KEY`
4. Configure monitored accounts:
   - `CONFIG_ACCOUNTS=user1,user2`

### Posting to Twitter (live mode)

`POST /2/tweets` requires **OAuth 2.0 user context** (the account that will send replies). When **`DRY_RUN=false`**, you must set:

- `TWITTER_OAUTH2_ACCESS_TOKEN` — OAuth 2.0 Access Token generated for your posting user

Generate this token in [X Developer Portal](https://developer.x.com/) under your app credentials (OAuth 2.0 Keys -> Generate access token for your own account). Scope must include at least `tweet.write` and `tweet.read`.

## Run locally

- Dry run (search + generate only; OAuth keys not required):
  - `DRY_RUN=true npm run bot`
- Live posting (search with Bearer, **post** with OAuth 2.0 user token):
  - `DRY_RUN=false npm run bot`

## Workflow

The bot executes:

1. Fetch tweets from each account (`max_results=10`)
2. Filter tweets using guardrails
3. Generate a reply via OpenRouter
4. Post reply (unless dry-run)
5. Store successful posts in SQLite (`data/bot.sqlite`)

## Logs and data

- Runtime log file: `bot.log`
- SQLite database: `data/bot.sqlite`
- Replies table: `posted_replies` (UNIQUE on `tweet_id + account`)

## GitHub Actions deployment

Workflow file: `.github/workflows/twitter-bot.yml`

Set repository secrets:

- `TWITTER_BEARER_TOKEN`
- `OPENROUTER_API_KEY`
- For live posting: `TWITTER_OAUTH2_ACCESS_TOKEN`
- Optional config secrets (`CONFIG_ACCOUNTS`, `CONFIG_MIN_ENGAGEMENT`, etc.)

Then push to default branch; job runs every 15 minutes and supports manual trigger.

## Testing

- Run unit tests:
  - `npm test`

## Safety recommendations

- Start with `DRY_RUN=true` for initial runs
- Keep `CONFIG_MAX_REPLIES_PER_DAY` low (default 5)
- Keep cooldown enabled (default 24 hours)
- Monitor Twitter/OpenRouter rate limits and spend regularly
