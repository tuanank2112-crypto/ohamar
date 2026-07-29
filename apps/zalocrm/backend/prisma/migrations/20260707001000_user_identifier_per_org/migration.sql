DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_phone_key";

CREATE UNIQUE INDEX IF NOT EXISTS "users_org_id_email_key" ON "users"("org_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_org_id_phone_key" ON "users"("org_id", "phone");
