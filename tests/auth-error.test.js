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

test('detects unauthorized 401 as auth config error', () => {
  assert.equal(
    isTwitterPostAuthConfigError({
      code: 401,
      data: { title: 'Unauthorized', detail: 'Unauthorized' }
    }),
    true
  );
});

test('detects oauth1 permission 403 as auth config error', () => {
  assert.equal(
    isTwitterPostAuthConfigError({
      code: 403,
      data: {
        type: 'https://api.twitter.com/2/problems/oauth1-permissions',
        detail: 'Your client app is not configured with the appropriate oauth1 app permissions for this endpoint.'
      }
    }),
    true
  );
});

test('ignores unrelated errors', () => {
  assert.equal(isTwitterPostAuthConfigError({ code: 500 }), false);
  assert.equal(isTwitterPostAuthConfigError({ code: 403, data: { detail: 'Something else' } }), false);
});
