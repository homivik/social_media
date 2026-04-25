const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAccounts, parseBoolean, parseNumber } = require('../src/config');

test('parseAccounts handles csv', () => {
  assert.deepEqual(parseAccounts('alice,bob'), ['alice', 'bob']);
});

test('parseAccounts handles json array', () => {
  assert.deepEqual(parseAccounts('["alice", " bob "]'), ['alice', 'bob']);
});

test('parseAccounts strips leading @', () => {
  assert.deepEqual(parseAccounts('@alice,bob'), ['alice', 'bob']);
  assert.deepEqual(parseAccounts('["@alice"]'), ['alice']);
});

test('parseBoolean handles defaults and true values', () => {
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean('true', false), true);
  assert.equal(parseBoolean('false', true), false);
});

test('parseNumber returns fallback for invalid value', () => {
  assert.equal(parseNumber('abc', 42), 42);
  assert.equal(parseNumber('12', 0), 12);
});
