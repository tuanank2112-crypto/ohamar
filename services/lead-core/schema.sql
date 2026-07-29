-- Lead Core schema v3 (enforce ownership, identity, dedup, consent append-only)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  source_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'NEW',
  intent TEXT,
  summary TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  close_reason TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (channel, source_user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner);

CREATE TABLE IF NOT EXISTS processed_messages (
  channel TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (channel, source_message_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'withdraw')),
  captured_at TEXT NOT NULL,
  source_message_id TEXT,
  note TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_consents_conv ON consents(conversation_id, type, captured_at);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS outbound_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  caller TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS send_leases (
  conversation_id TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_conv ON audit_events(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS watch_snapshots (
  source_url TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  excerpt TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- G3: chặn owner/status rác ở tầng DB, kể cả khi có đường ghi nào bỏ qua
-- validate của handlers.mjs.
-- Dùng trigger thay vì CHECK constraint vì CREATE TABLE IF NOT EXISTS không thể
-- thêm CHECK vào bảng đã tồn tại; trigger thì CREATE TRIGGER IF NOT EXISTS được.
-- ---------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_conversations_owner_insert
BEFORE INSERT ON conversations
FOR EACH ROW
WHEN NEW.owner NOT IN ('none', 'gia_huy', 'minh_phat', 'fb_page', 'human')
BEGIN
  SELECT RAISE(ABORT, 'invalid conversations.owner');
END;

CREATE TRIGGER IF NOT EXISTS trg_conversations_owner_update
BEFORE UPDATE OF owner ON conversations
FOR EACH ROW
WHEN NEW.owner NOT IN ('none', 'gia_huy', 'minh_phat', 'fb_page', 'human')
BEGIN
  SELECT RAISE(ABORT, 'invalid conversations.owner');
END;

CREATE TRIGGER IF NOT EXISTS trg_conversations_status_insert
BEFORE INSERT ON conversations
FOR EACH ROW
WHEN NEW.status NOT IN ('NEW', 'BOT_ACTIVE', 'WAITING_CONSENT', 'ASSIGNED', 'HUMAN_ACTIVE', 'CLOSED')
BEGIN
  SELECT RAISE(ABORT, 'invalid conversations.status');
END;

CREATE TRIGGER IF NOT EXISTS trg_conversations_status_update
BEFORE UPDATE OF status ON conversations
FOR EACH ROW
WHEN NEW.status NOT IN ('NEW', 'BOT_ACTIVE', 'WAITING_CONSENT', 'ASSIGNED', 'HUMAN_ACTIVE', 'CLOSED')
BEGIN
  SELECT RAISE(ABORT, 'invalid conversations.status');
END;

CREATE TRIGGER IF NOT EXISTS trg_handoffs_owner_insert
BEFORE INSERT ON handoffs
FOR EACH ROW
WHEN NEW.from_owner NOT IN ('none', 'gia_huy', 'minh_phat', 'fb_page', 'human')
  OR NEW.to_owner NOT IN ('none', 'gia_huy', 'minh_phat', 'fb_page', 'human')
BEGIN
  SELECT RAISE(ABORT, 'invalid handoffs owner');
END;

CREATE TRIGGER IF NOT EXISTS trg_outbound_caller_insert
BEFORE INSERT ON outbound_log
FOR EACH ROW
WHEN NEW.caller NOT IN ('gia_huy', 'minh_phat', 'fb_page', 'human')
BEGIN
  SELECT RAISE(ABORT, 'invalid outbound_log.caller');
END;

INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '3');
UPDATE meta SET value = '3' WHERE key = 'schema_version';
INSERT OR IGNORE INTO meta(key, value) VALUES ('retention_days', '365');
