const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipTweet } = require('../src/bot');

function buildConfig() {
  return {
    filters: {
      minEngagement: 10,
      maxRepliesPerDay: 2
    },
    cooldownHours: 24
  };
}

function buildLogger() {
  return {
    warn: () => {}
  };
}

test('should not skip tweet by age (no max-age filter)', () => {
  const tweet = {
    id: '1',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    public_metrics: { like_count: 100 }
  };

  const db = {
    hasReplied: () => false,
    getLastReplyTimestamp: () => null,
    getRepliesTodayCount: () => 0
  };

  const reason = shouldSkipTweet({ tweet, account: 'alice', config: buildConfig(), db, logger: buildLogger() });
  assert.equal(reason, null);
});

test('should skip low engagement', () => {
  const tweet = {
    id: '2',
    created_at: new Date().toISOString(),
    public_metrics: { like_count: 5 }
  };

  const db = {
    hasReplied: () => false,
    getLastReplyTimestamp: () => null,
    getRepliesTodayCount: () => 0
  };

  const reason = shouldSkipTweet({ tweet, account: 'alice', config: buildConfig(), db, logger: buildLogger() });
  assert.equal(reason, 'low engagement (5 < 10)');
});

test('should skip if cooldown active', () => {
  const tweet = {
    id: '3',
    created_at: new Date().toISOString(),
    public_metrics: { like_count: 20 }
  };

  const db = {
    hasReplied: () => false,
    getLastReplyTimestamp: () => new Date(Date.now() - 2 * 60 * 60 * 1000),
    getRepliesTodayCount: () => 0
  };

  const reason = shouldSkipTweet({ tweet, account: 'alice', config: buildConfig(), db, logger: buildLogger() });
  assert.equal(reason, 'cooldown (24hr)');
});
