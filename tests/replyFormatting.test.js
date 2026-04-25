const test = require('node:test');
const assert = require('node:assert/strict');
const { truncateReply, estimateCostFromUsage } = require('../src/clients/openRouterClient');

test('truncateReply keeps short text unchanged', () => {
  assert.equal(truncateReply('hello', 10), 'hello');
});

test('truncateReply trims with ellipsis', () => {
  assert.equal(truncateReply('abcdefghijklmnop', 10), 'abcdefg...');
});

test('estimateCostFromUsage computes expected estimate', () => {
  assert.equal(estimateCostFromUsage({ total_tokens: 2000 }), 0.001);
});

test('estimateCostFromUsage returns null for missing usage', () => {
  assert.equal(estimateCostFromUsage(null), null);
});
