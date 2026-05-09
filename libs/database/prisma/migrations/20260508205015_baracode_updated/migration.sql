-- DropIndex
DROP INDEX "samples_barcode_idx";

-- AlterTable
ALTER TABLE "barcode_counters" ALTER COLUMN "updated_at" DROP DEFAULT;
