-- Make AI auto-reply the default for 1-1 customer conversations.
-- Human takeover still wins through handoff_status='TAKEN', and users can set
-- ai_mode='OFF' to stop AI replies for a conversation.

ALTER TABLE "zalo_accounts"
  ALTER COLUMN "ai_auto_enabled" SET DEFAULT true;

ALTER TABLE "conversations"
  ALTER COLUMN "ai_mode" SET DEFAULT 'AUTO';

ALTER TABLE "ai_configs"
  ALTER COLUMN "rag_enabled" SET DEFAULT true,
  ALTER COLUMN "rag_auto_daily_budget" SET DEFAULT 500,
  ALTER COLUMN "rag_kill_switch" SET DEFAULT false;

UPDATE "zalo_accounts"
SET "ai_auto_enabled" = true
WHERE "ai_auto_enabled" = false
  AND "archived_at" IS NULL;

UPDATE "conversations"
SET "ai_mode" = 'AUTO'
WHERE "threadType" = 'user'
  AND "is_virtual" = false
  AND "ai_mode" = 'OFF';

UPDATE "ai_configs"
SET
  "rag_enabled" = true,
  "rag_auto_daily_budget" = CASE
    WHEN "rag_auto_daily_budget" <= 0 THEN 500
    ELSE "rag_auto_daily_budget"
  END,
  "rag_kill_switch" = false;
