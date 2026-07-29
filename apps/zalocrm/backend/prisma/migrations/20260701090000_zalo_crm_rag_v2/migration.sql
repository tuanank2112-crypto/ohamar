CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "zalo_accounts"
  ADD COLUMN IF NOT EXISTS "session_ciphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "session_key_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "safety_status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspended_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_auto_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "ai_mode" TEXT NOT NULL DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS "handoff_status" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "handoff_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "handoff_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "handoff_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_ai_decision_id" TEXT;

ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "rag_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rag_similarity_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.78,
  ADD COLUMN IF NOT EXISTS "rag_top_k" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "rag_auto_daily_budget" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rag_kill_switch" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "catalog_items" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(18,2),
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "catalog_items_org_id_sku_key" ON "catalog_items"("org_id", "sku");
CREATE INDEX "catalog_items_org_id_status_name_idx" ON "catalog_items"("org_id", "status", "name");

CREATE TABLE "knowledge_documents" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "catalog_item_id" TEXT,
  "title" TEXT NOT NULL,
  "source_type" TEXT NOT NULL DEFAULT 'manual',
  "file_name" TEXT,
  "mime_type" TEXT,
  "storage_key" TEXT,
  "raw_text" TEXT,
  "checksum" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "error_message" TEXT,
  "uploaded_by_id" TEXT NOT NULL,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_documents_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL,
  CONSTRAINT "knowledge_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id"),
  CONSTRAINT "knowledge_documents_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "knowledge_documents_org_id_checksum_version_key" ON "knowledge_documents"("org_id", "checksum", "version");
CREATE INDEX "knowledge_documents_org_id_status_updated_at_idx" ON "knowledge_documents"("org_id", "status", "updated_at" DESC);

CREATE TABLE "knowledge_chunks" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "catalog_item_id" TEXT,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "token_count" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "embedding" vector(768),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_chunks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_chunks_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "knowledge_chunks_document_id_position_key" ON "knowledge_chunks"("document_id", "position");
CREATE INDEX "knowledge_chunks_org_id_status_document_id_idx" ON "knowledge_chunks"("org_id", "status", "document_id");
CREATE INDEX "knowledge_chunks_org_id_checksum_idx" ON "knowledge_chunks"("org_id", "checksum");
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "ai_decisions" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "inbound_message_id" TEXT,
  "mode" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "answer" TEXT,
  "intent" TEXT,
  "risk_flags" JSONB NOT NULL DEFAULT '[]',
  "handoff_reason" TEXT,
  "similarity" DOUBLE PRECISION,
  "llm_confidence" DOUBLE PRECISION,
  "model" TEXT,
  "latency_ms" INTEGER,
  "input_redacted" TEXT,
  "policy_snapshot" JSONB NOT NULL DEFAULT '{}',
  "send_status" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_decisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_decisions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL
);
CREATE INDEX "ai_decisions_org_id_created_at_idx" ON "ai_decisions"("org_id", "created_at" DESC);
CREATE INDEX "ai_decisions_conversation_id_created_at_idx" ON "ai_decisions"("conversation_id", "created_at" DESC);

CREATE TABLE "knowledge_citations" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "ai_decision_id" TEXT NOT NULL,
  "chunk_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "similarity" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_citations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_citations_ai_decision_id_fkey" FOREIGN KEY ("ai_decision_id") REFERENCES "ai_decisions"("id") ON DELETE CASCADE,
  CONSTRAINT "knowledge_citations_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "knowledge_citations_ai_decision_id_chunk_id_key" ON "knowledge_citations"("ai_decision_id", "chunk_id");
CREATE INDEX "knowledge_citations_org_id_chunk_id_idx" ON "knowledge_citations"("org_id", "chunk_id");

CREATE TABLE "order_import_batches" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "file_name" TEXT,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "mapping" JSONB NOT NULL DEFAULT '{}',
  "preview_rows" JSONB NOT NULL DEFAULT '[]',
  "error_rows" JSONB NOT NULL DEFAULT '[]',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "imported_rows" INTEGER NOT NULL DEFAULT 0,
  "updated_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT NOT NULL,
  "committed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_import_batches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "order_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);
CREATE UNIQUE INDEX "order_import_batches_org_id_checksum_key" ON "order_import_batches"("org_id", "checksum");
CREATE INDEX "order_import_batches_org_id_created_at_idx" ON "order_import_batches"("org_id", "created_at" DESC);

CREATE TABLE "orders" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "import_batch_id" TEXT,
  "customer_code" TEXT,
  "customer_phone" TEXT,
  "customer_zalo_uid" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "ordered_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL,
  CONSTRAINT "orders_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "order_import_batches"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "orders_org_id_external_id_key" ON "orders"("org_id", "external_id");
CREATE INDEX "orders_org_id_contact_id_ordered_at_idx" ON "orders"("org_id", "contact_id", "ordered_at" DESC);
CREATE INDEX "orders_org_id_customer_phone_idx" ON "orders"("org_id", "customer_phone");

CREATE TABLE "order_items" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "catalog_item_id" TEXT,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "order_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL
);
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_catalog_item_id_idx" ON "order_items"("catalog_item_id");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_handoff_by_id_fkey" FOREIGN KEY ("handoff_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_ai_mode_check" CHECK ("ai_mode" IN ('OFF', 'ASSIST', 'AUTO')),
  ADD CONSTRAINT "conversations_handoff_status_check" CHECK ("handoff_status" IN ('NONE', 'REQUESTED', 'TAKEN'));
