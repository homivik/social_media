const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS posted_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      reply_tweet_id TEXT NOT NULL,
      reply_text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      cost_usd REAL,
      UNIQUE(tweet_id, account)
    );
  `);

  const statements = {
    hasReplied: db.prepare('SELECT 1 FROM posted_replies WHERE account = ? AND tweet_id = ? LIMIT 1'),
    lastReplyForAccount: db.prepare('SELECT timestamp FROM posted_replies WHERE account = ? ORDER BY timestamp DESC LIMIT 1'),
    repliesTodayForAccount: db.prepare("SELECT COUNT(*) AS total FROM posted_replies WHERE account = ? AND DATE(timestamp) = DATE('now')"),
    insertReply: db.prepare('INSERT INTO posted_replies (account, tweet_id, reply_tweet_id, reply_text, cost_usd) VALUES (?, ?, ?, ?, ?)'),
    totalCost: db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM posted_replies')
  };

  return {
    hasReplied(account, tweetId) {
      return Boolean(statements.hasReplied.get(account, tweetId));
    },

    getLastReplyTimestamp(account) {
      const row = statements.lastReplyForAccount.get(account);
      return row?.timestamp ? new Date(row.timestamp) : null;
    },

    getRepliesTodayCount(account) {
      const row = statements.repliesTodayForAccount.get(account);
      return row?.total || 0;
    },

    insertPostedReply({ account, tweetId, replyTweetId, replyText, costUsd }) {
      try {
        statements.insertReply.run(account, tweetId, replyTweetId, replyText, costUsd);
        return true;
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return false;
        }

        throw error;
      }
    },

    getTotalCostUsd() {
      return statements.totalCost.get().total || 0;
    },

    close() {
      db.close();
    }
  };
}

module.exports = {
  createDatabase
};
