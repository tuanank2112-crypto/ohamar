-- Auto-Care follow-up + birthday greeting org config (additive, opt-in defaults).
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "auto_care_followup_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auto_care_followup_delay_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "auto_care_sale_quiet_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "birthday_greeting_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "birthday_message_template" TEXT,
  ADD COLUMN IF NOT EXISTS "birthday_voucher_code" TEXT;
