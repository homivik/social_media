const test = require('node:test');
const assert = require('node:assert/strict');
const { isTwitterPostAuthConfigError } = require('../src/bot');

test('detects unsupported-authentication 403 from Twitter', () => {
  assert.equal(
    isTwitterPostAuthConfigError({
      code: 403,
      data: {
        title: 'Unsupported Authentication',
        detail: 'Authenticating with OAuth 2.0 Application-Only is forbidden for this endpoint.',
        type: 'https://api.twitter.com/2/problems/unsupported-authentication',
        status: 403
      }
    }),
    true
  );
});

test('ignores unrelated errors', () => {
  assert.equal(isTwitterPostAuthConfigError({ code: 401 }), false);
  assert.equal(isTwitterPostAuthConfigError({ code: 403, data: { detail: 'Something else' } }), false);
});
