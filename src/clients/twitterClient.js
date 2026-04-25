const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');

function createTwitterClient(config, logger) {
  const client = axios.create({
    baseURL: config.twitter.baseUrl,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${config.twitter.bearerToken}`
    }
  });

  let readWriteUser = null;
  if (config.twitter.oauth1) {
    const userClient = new TwitterApi({
      appKey: config.twitter.oauth1.appKey,
      appSecret: config.twitter.oauth1.appSecret,
      accessToken: config.twitter.oauth1.accessToken,
      accessSecret: config.twitter.oauth1.accessSecret
    });
    readWriteUser = userClient.readWrite;
    logger.debug('TWITTER', 'OAuth 1.0a user client initialized for posting');
  }

  async function fetchRecentTweets(account) {
    const terms = [`from:${account}`];

    if (config.filters.excludeReplies) {
      terms.push('-is:reply');
    }

    if (config.filters.excludeRetweets) {
      terms.push('-is:retweet');
    }

    const query = terms.join(' ');

    const response = await client.get('/tweets/search/recent', {
      params: {
        query,
        max_results: 10,
        'tweet.fields': 'public_metrics,created_at,author_id'
      }
    });

    const tweets = response.data.data || [];
    logger.debug('TWITTER', 'Fetched tweets for account', { account, count: tweets.length });
    return tweets;
  }

  async function postReply(tweetId, text) {
    if (!readWriteUser) {
      throw new Error(
        'Twitter post requires OAuth 1.0a user credentials. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET (and use DRY_RUN=false only when they are set).'
      );
    }

    const result = await readWriteUser.v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: tweetId }
    });

    return result.data;
  }

  return {
    fetchRecentTweets,
    postReply
  };
}

module.exports = {
  createTwitterClient
};
