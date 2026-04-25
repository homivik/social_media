const axios = require('axios');

function createTwitterClient(config, logger) {
  const readClient = axios.create({
    baseURL: config.twitter.baseUrl,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${config.twitter.bearerToken}`
    }
  });

  let postClient = null;
  if (config.twitter.oauth2User?.accessToken) {
    postClient = axios.create({
      baseURL: config.twitter.baseUrl,
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${config.twitter.oauth2User.accessToken}`
      }
    });
    logger.debug('TWITTER', 'OAuth 2.0 user access token initialized for posting');
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

    const response = await readClient.get('/tweets/search/recent', {
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

  async function verifyPostAuth() {
    if (!postClient) {
      throw new Error(
        'Twitter post requires OAuth 2.0 user access token. Set TWITTER_OAUTH2_ACCESS_TOKEN (and use DRY_RUN=false only when set).'
      );
    }

    const response = await postClient.get('/users/me');
    return response.data?.data || null;
  }

  async function postReply(tweetId, text) {
    if (!postClient) {
      throw new Error(
        'Twitter post requires OAuth 2.0 user access token. Set TWITTER_OAUTH2_ACCESS_TOKEN (and use DRY_RUN=false only when set).'
      );
    }

    const response = await postClient.post('/tweets', {
      text,
      reply: { in_reply_to_tweet_id: tweetId }
    });

    return response.data?.data;
  }

  return {
    fetchRecentTweets,
    verifyPostAuth,
    postReply
  };
}

module.exports = {
  createTwitterClient
};
