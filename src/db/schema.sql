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
