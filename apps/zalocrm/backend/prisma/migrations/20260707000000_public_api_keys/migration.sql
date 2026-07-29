CREATE TABLE "public_api_keys" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "name" TEXT,
  "key_hash" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_api_keys_key_hash_key" ON "public_api_keys"("key_hash");
CREATE INDEX "public_api_keys_org_id_revoked_at_idx" ON "public_api_keys"("org_id", "revoked_at");

ALTER TABLE "public_api_keys"
  ADD CONSTRAINT "public_api_keys_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "public_api_keys" ("id", "org_id", "name", "key_hash", "key_prefix", "scopes", "created_at", "updated_at")
SELECT gen_random_uuid()::TEXT, "org_id", 'Legacy public API key', "value_plain", 'zcrm_****', ARRAY['contacts:read','contacts:write','conversations:read','appointments:read','appointments:write','messages:send']::TEXT[], "created_at", CURRENT_TIMESTAMP
FROM "app_settings"
WHERE "setting_key" = 'public_api_key_hash'
  AND "value_plain" IS NOT NULL
ON CONFLICT ("key_hash") DO NOTHING;

DELETE FROM "app_settings"
WHERE "setting_key" IN ('public_api_key', 'public_api_key_hash');
