const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { createDatabase } = require('./db');
const { createTwitterClient } = require('./clients/twitterClient');
const { createOpenRouterClient } = require('./clients/openRouterClient');

const TEXT_PREVIEW_LEN = 160;

function tweetPermalink(username, tweetId) {
  const handle = String(username || '').replace(/^@+/, '');
  return `https://x.com/${handle}/status/${tweetId}`;
}

function previewText(text, maxLen = TEXT_PREVIEW_LEN) {
  if (!text) {
    return '';
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }

  return `${normalized.slice(0, maxLen - 1)}…`;
}

function isTwitterPostAuthConfigError(error) {
  const status = error?.code ?? error?.response?.status;
  const data = error?.data ?? error?.response?.data;
  if (status !== 403) {
    return false;
  }
  const type = String(data?.type || '');
  const detail = String(data?.detail || '');
  return type.includes('unsupported-authentication') || detail.includes('Application-Only');
}

function sortTweetsNewestFirst(tweets) {
  return [...tweets].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) {
      return 0;
    }
    if (Number.isNaN(ta)) {
      return 1;
    }
    if (Number.isNaN(tb)) {
      return -1;
    }
    return tb - ta;
  });
}

function hoursBetween(olderDate, newerDate = new Date()) {
  return (newerDate.getTime() - olderDate.getTime()) / (1000 * 60 * 60);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retryWithBackoff(fn, { retries = 2, initialDelayMs = 1000, logger, component, operation }) {
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.response?.status;
      const shouldRetry = attempt < retries && (status === 429 || status >= 500 || !status);

      if (!shouldRetry) {
        throw error;
      }

      logger.warn(component, `${operation} failed; retrying`, {
        attempt: attempt + 1,
        retries,
        status,
        delayMs: delay
      });

      await sleep(delay);
      delay *= 2;
    }
  }

  return null;
}

function shouldSkipTweet({ tweet, account, config, db, logger }) {
  const now = new Date();
  const tweetCreatedAt = new Date(tweet.created_at);

  if (Number.isNaN(tweetCreatedAt.getTime())) {
    logger.warn('FILTER', 'Skipping tweet with invalid timestamp', { account, tweetId: tweet.id });
    return 'invalid timestamp';
  }

  if (db.hasReplied(account, tweet.id)) {
    return 'already replied';
  }

  if (config.filters.minEngagement > 0) {
    const likes = tweet.public_metrics?.like_count || 0;
    if (likes < config.filters.minEngagement) {
      return `low engagement (${likes} < ${config.filters.minEngagement})`;
    }
  }

  const lastReplyTime = db.getLastReplyTimestamp(account);
  if (lastReplyTime && hoursBetween(lastReplyTime, now) < config.cooldownHours) {
    return `cooldown (${config.cooldownHours}hr)`;
  }

  const repliesToday = db.getRepliesTodayCount(account);
  if (repliesToday >= config.filters.maxRepliesPerDay) {
    return `max replies/day reached (${repliesToday}/${config.filters.maxRepliesPerDay})`;
  }

  return null;
}

async function run() {
  const config = loadConfig();
  const logger = createLogger({
    logLevel: config.logLevel,
    logPath: config.paths.logPath
  });
  const db = createDatabase(config.paths.dbPath);
  const twitterClient = createTwitterClient(config, logger);
  const openRouterClient = createOpenRouterClient(config, logger);

  const summary = {
    processed: 0,
    skipped: 0,
    generated: 0,
    posted: 0,
    errors: 0,
    costUsd: 0
  };

  try {
    if (config.accountsToMonitor.length === 0) {
      logger.warn('BOT', 'No accounts configured; exiting');
      return;
    }

    logger.info('BOT', 'Run started', {
      accounts: config.accountsToMonitor.length,
      dryRun: config.dryRun
    });

    for (const account of config.accountsToMonitor) {
      let tweets = [];

      try {
        tweets = await retryWithBackoff(
          () => twitterClient.fetchRecentTweets(account),
          {
            retries: 2,
            initialDelayMs: 1500,
            logger,
            component: 'TWITTER',
            operation: `fetch recent tweets for ${account}`
          }
        );
      } catch (error) {
        summary.errors += 1;
        logger.error('TWITTER', 'Failed to fetch tweets for account', {
          account,
          status: error?.response?.status,
          body: error?.response?.data,
          message: error.message
        });
        continue;
      }

      if (!tweets || tweets.length === 0) {
        logger.info('FETCH', 'No tweets returned for account', { account, stage: 'FETCH' });
        continue;
      }

      const sortedTweets = sortTweetsNewestFirst(tweets);
      logger.info('FETCH', 'Recent tweets loaded (newest first; up to 10 from search)', {
        account,
        stage: 'FETCH',
        count: sortedTweets.length
      });

      sortedTweets.forEach((tweet, index) => {
        const likes = tweet.public_metrics?.like_count ?? 0;
        logger.info('FETCH', 'Tweet from search', {
          stage: 'FETCH',
          account,
          rank: index + 1,
          tweetId: tweet.id,
          createdAt: tweet.created_at,
          likes,
          retweets: tweet.public_metrics?.retweet_count,
          url: tweetPermalink(account, tweet.id),
          textPreview: previewText(tweet.text)
        });
      });

      let handledOneReplyThisAccount = false;

      for (const tweet of sortedTweets) {
        summary.processed += 1;

        const skipReason = shouldSkipTweet({ tweet, account, config, db, logger });
        if (skipReason) {
          summary.skipped += 1;
          logger.warn('FILTER', 'Skipping tweet', {
            stage: 'FILTER',
            account,
            tweetId: tweet.id,
            createdAt: tweet.created_at,
            url: tweetPermalink(account, tweet.id),
            textPreview: previewText(tweet.text),
            reason: skipReason
          });
          continue;
        }

        logger.info('FILTER', 'Tweet passed filters — proceeding to generate', {
          stage: 'FILTER',
          account,
          tweetId: tweet.id,
          createdAt: tweet.created_at,
          url: tweetPermalink(account, tweet.id),
          textPreview: previewText(tweet.text),
          likes: tweet.public_metrics?.like_count ?? 0
        });

        let generation;
        const genStarted = Date.now();
        try {
          logger.info('GENERATE', 'Calling OpenRouter', {
            stage: 'GENERATE',
            account,
            tweetId: tweet.id,
            url: tweetPermalink(account, tweet.id),
            sourceTextPreview: previewText(tweet.text, 280)
          });
          generation = await retryWithBackoff(
            () => openRouterClient.generateReply(tweet.text, config.replyStyle),
            {
              retries: 1,
              initialDelayMs: 1000,
              logger,
              component: 'OPENROUTER',
              operation: `generate reply for ${tweet.id}`
            }
          );
        } catch (error) {
          summary.errors += 1;
          logger.error('GENERATE', 'Reply generation failed', {
            stage: 'GENERATE',
            account,
            tweetId: tweet.id,
            status: error?.response?.status,
            body: error?.response?.data,
            message: error.message
          });
          continue;
        }

        const genMs = Date.now() - genStarted;

        if (!generation || !generation.reply) {
          summary.skipped += 1;
          logger.warn('GENERATE', 'Invalid or empty reply; skipping tweet', {
            stage: 'GENERATE',
            account,
            tweetId: tweet.id,
            durationMs: genMs
          });
          continue;
        }

        summary.generated += 1;
        const costUsd = generation.costUsd;
        if (typeof costUsd === 'number') {
          summary.costUsd += costUsd;
        }

        logger.info('GENERATE', 'Reply text ready', {
          stage: 'GENERATE',
          account,
          tweetId: tweet.id,
          durationMs: genMs,
          costUsd,
          replyPreview: previewText(generation.reply, 280),
          inReplyToUrl: tweetPermalink(account, tweet.id)
        });

        if (config.dryRun) {
          logger.info('POST', 'DRY RUN — not posting to Twitter', {
            stage: 'POST',
            account,
            inReplyToTweetId: tweet.id,
            inReplyToUrl: tweetPermalink(account, tweet.id),
            replyPreview: previewText(generation.reply, 280),
            costUsd
          });
          handledOneReplyThisAccount = true;
          break;
        }

        let posted;
        try {
          logger.info('POST', 'Posting reply via Twitter API', {
            stage: 'POST',
            account,
            inReplyToTweetId: tweet.id,
            inReplyToUrl: tweetPermalink(account, tweet.id)
          });
          posted = await retryWithBackoff(
            () => twitterClient.postReply(tweet.id, generation.reply),
            {
              retries: 2,
              initialDelayMs: 1500,
              logger,
              component: 'TWITTER',
              operation: `post reply for ${tweet.id}`
            }
          );
        } catch (error) {
          summary.errors += 1;
          const status = error?.code ?? error?.response?.status;
          const body = error?.data ?? error?.response?.data;
          logger.error('POST', 'Failed to post reply', {
            stage: 'POST',
            account,
            tweetId: tweet.id,
            status,
            body,
            message: error.message
          });
          if (isTwitterPostAuthConfigError(error)) {
            logger.error(
              'POST',
              'Twitter rejected credentials (use OAuth 1.0a user access token + secret for posting). Stopping further posts this run.',
              { stage: 'POST' }
            );
            break;
          }
          continue;
        }

        if (!posted || !posted.id) {
          summary.errors += 1;
          logger.error('POST', 'Post response missing tweet id', {
            stage: 'POST',
            account,
            tweetId: tweet.id
          });
          continue;
        }

        const inserted = db.insertPostedReply({
          account,
          tweetId: tweet.id,
          replyTweetId: posted.id,
          replyText: generation.reply,
          costUsd
        });

        if (!inserted) {
          logger.warn('DB', 'Duplicate reply record prevented by UNIQUE constraint', {
            account,
            tweetId: tweet.id
          });
          handledOneReplyThisAccount = true;
          break;
        }

        summary.posted += 1;
        logger.info('POST', 'Reply posted successfully', {
          stage: 'POST',
          account,
          inReplyToTweetId: tweet.id,
          inReplyToUrl: tweetPermalink(account, tweet.id),
          replyTweetId: posted.id,
          replyUrl: `https://x.com/i/status/${posted.id}`,
          costUsd
        });
        handledOneReplyThisAccount = true;
        break;
      }

      if (!handledOneReplyThisAccount && sortedTweets.length > 0) {
        logger.info('BOT', 'No reply for this account this run (all tweets skipped or errors)', {
          account,
          stage: 'SUMMARY'
        });
      }
    }

    const cumulativeCost = Number(db.getTotalCostUsd());
    if (cumulativeCost > config.costLimitUsd) {
      logger.warn('COST', 'Cumulative OpenRouter cost exceeded configured limit', {
        cumulativeCost,
        costLimitUsd: config.costLimitUsd
      });
    }

    logger.info('BOT', 'Run completed', {
      ...summary,
      cumulativeCostUsd: cumulativeCost
    });

    if (config.dryRun) {
      logger.info('BOT', `DRY RUN MODE: ${summary.generated} tweets would have been replied to`);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [BOT] Fatal error`, error);
    process.exitCode = 1;
  });
}

module.exports = {
  run,
  shouldSkipTweet,
  retryWithBackoff,
  hoursBetween,
  isTwitterPostAuthConfigError
};
