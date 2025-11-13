-- SQL schema for Cloudflare D1
-- Run this once on your D1 instance to create tables.

CREATE TABLE IF NOT EXISTS owners (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  payload_json TEXT, -- original form data, flexible
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending', -- pending, payment_initiated, paid, rejected
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  submission_id TEXT, -- source submission
  title TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  images_json TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  tags_json TEXT,
  owner_id TEXT,
  status TEXT DEFAULT 'published', -- published, archived
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  provider TEXT, -- 'dodo'
  provider_payment_id TEXT, -- dodo's payment/checkout id
  submission_id TEXT,
  product_id TEXT,
  status TEXT, -- pending, completed, failed, refunded
  amount_cents INTEGER,
  currency TEXT,
  customer_email TEXT,
  metadata_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_submission ON payments(submission_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id TEXT PRIMARY KEY,
  provider TEXT,
  event_type TEXT,
  raw_payload TEXT,
  headers_json TEXT,
  verified INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
