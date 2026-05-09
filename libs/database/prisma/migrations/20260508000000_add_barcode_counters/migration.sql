-- Migration: add_barcode_counters
-- Replaces the application-level count-based barcode generation with a
-- PostgreSQL-native atomic UPSERT counter.
--
-- Barcode format: YY + XXXXXXXX (10 digits, numeric-only)
--   Example: 2600000001
--
-- Generation is done via a single atomic SQL statement in BarcodeService:
--   INSERT INTO barcode_counters ... ON CONFLICT DO UPDATE SET current_value + 1
--   RETURNING current_value
-- This is race-condition-free at any concurrency level without explicit locks.

-- CreateTable
CREATE TABLE "barcode_counters" (
    "id"             TEXT      NOT NULL,
    "laboratory_id"  TEXT      NOT NULL,
    "year"           INTEGER   NOT NULL,
    -- BigInt allows 9,223,372,036,854,775,807 — effectively unlimited
    "current_value"  BIGINT    NOT NULL DEFAULT 0,
    "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_counters_pkey" PRIMARY KEY ("id")
);

-- One row per lab × year (the conflict target for the atomic UPSERT)
CREATE UNIQUE INDEX "barcode_counters_laboratory_id_year_key"
    ON "barcode_counters"("laboratory_id", "year");

-- Fast per-lab lookup (reset / report queries)
CREATE INDEX "barcode_counters_laboratory_id_idx"
    ON "barcode_counters"("laboratory_id");

-- AddForeignKey
ALTER TABLE "barcode_counters"
    ADD CONSTRAINT "barcode_counters_laboratory_id_fkey"
    FOREIGN KEY ("laboratory_id")
    REFERENCES "laboratories"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- -----------------------------------------------------------------------
-- Supplemental index: make barcode text lookups in samples O(log n)
-- The unique composite index (barcode, laboratory_id) already exists from
-- the initial migration; this btree on barcode alone speeds up device
-- ingest lookups that arrive without knowing the lab ID in advance.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "samples_barcode_idx" ON "samples"("barcode");
