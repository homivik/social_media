const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseAccounts(value) {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim().replace(/^@+/, ''))
          .filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return trimmed
    .split(',')
    .map((account) => account.trim().replace(/^@+/, ''))
    .filter(Boolean);
}

function assertRequired(name) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name}`);
  }
}

function loadConfig() {
  assertRequired('TWITTER_BEARER_TOKEN');
  assertRequired('OPENROUTER_API_KEY');

  const dryRun = parseBoolean(process.env.DRY_RUN, false);

  if (!dryRun) {
    assertRequired('TWITTER_OAUTH2_ACCESS_TOKEN');
  }

  const logLevel = String(process.env.LOG_LEVEL || 'INFO').toUpperCase();

  return {
    paths: {
      dbPath: path.resolve(process.cwd(), 'data', 'bot.sqlite'),
      logPath: path.resolve(process.cwd(), 'bot.log')
    },
    twitter: {
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
      baseUrl: 'https://api.twitter.com/2',
      oauth2User: dryRun
        ? null
        : {
            accessToken: process.env.TWITTER_OAUTH2_ACCESS_TOKEN
          }
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'auto',
      timeoutMs: 10000,
      maxTokens: parseNumber(process.env.OPENROUTER_MAX_TOKENS, 100),
      temperature: parseNumber(process.env.OPENROUTER_TEMPERATURE, 0.7)
    },
    accountsToMonitor: parseAccounts(process.env.CONFIG_ACCOUNTS),
    replyStyle: {
      tone: process.env.CONFIG_REPLY_TONE || 'engaging',
      maxLength: parseNumber(process.env.CONFIG_MAX_REPLY_LENGTH, 260),
      includeEmoji: parseBoolean(process.env.CONFIG_INCLUDE_EMOJI, true),
      askQuestions: parseBoolean(process.env.CONFIG_ASK_QUESTIONS, true)
    },
    filters: {
      minEngagement: parseNumber(process.env.CONFIG_MIN_ENGAGEMENT, 0),
      maxRepliesPerDay: parseNumber(process.env.CONFIG_MAX_REPLIES_PER_DAY, 5),
      excludeReplies: parseBoolean(process.env.CONFIG_EXCLUDE_REPLIES, true),
      excludeRetweets: parseBoolean(process.env.CONFIG_EXCLUDE_RETWEETS, true)
    },
    cooldownHours: parseNumber(process.env.CONFIG_COOLDOWN_HOURS, 24),
    dryRun,
    costLimitUsd: parseNumber(process.env.COST_LIMIT_USD, 10),
    logLevel: LOG_LEVELS.includes(logLevel) ? logLevel : 'INFO'
  };
}

module.exports = {
  loadConfig,
  parseAccounts,
  parseBoolean,
  parseNumber
};
