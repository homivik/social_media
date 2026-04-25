const axios = require('axios');

function truncateReply(reply, maxLength) {
  if (!reply) {
    return '';
  }

  if (reply.length <= maxLength) {
    return reply;
  }

  if (maxLength <= 3) {
    return '.'.repeat(maxLength);
  }

  return `${reply.slice(0, maxLength - 3)}...`;
}

function estimateCostFromUsage(usage) {
  if (!usage || typeof usage.total_tokens !== 'number') {
    return null;
  }

  const estimatedCostPer1kTokens = 0.0005;
  return Number(((usage.total_tokens / 1000) * estimatedCostPer1kTokens).toFixed(6));
}

function createOpenRouterClient(config, logger) {
  const client = axios.create({
    baseURL: config.openRouter.baseUrl,
    timeout: config.openRouter.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.openRouter.apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  async function generateReply(tweetText, replyStyle) {
    const systemPrompt = [
      `You are a Twitter engagement assistant with a ${replyStyle.tone} tone.`,
      'Always write the final reply in natural Japanese.',
      `Max reply length: ${replyStyle.maxLength} characters.`,
      replyStyle.includeEmoji ? 'Use emoji only if natural.' : 'Do not include emojis.',
      replyStyle.askQuestions ? 'Prefer ending with a thoughtful question.' : 'Do not force a question.',
      'Reply should reference the original tweet context and avoid generic praise.'
    ].join(' ');

    const response = await client.post('/chat/completions', {
      model: config.openRouter.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Original tweet: ${tweetText}` }
      ],
      max_tokens: config.openRouter.maxTokens,
      temperature: config.openRouter.temperature,
      top_p: 0.9
    });

    const reply = response.data?.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) {
      logger.warn('OPENROUTER', 'Empty reply received');
      return { reply: '', costUsd: null };
    }

    return {
      reply: truncateReply(reply, replyStyle.maxLength),
      costUsd: estimateCostFromUsage(response.data?.usage)
    };
  }

  return {
    generateReply,
    truncateReply,
    estimateCostFromUsage
  };
}

module.exports = {
  createOpenRouterClient,
  truncateReply,
  estimateCostFromUsage
};
