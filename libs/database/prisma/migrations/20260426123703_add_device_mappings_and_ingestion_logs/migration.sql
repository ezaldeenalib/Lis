-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('SUCCESS', 'FAILED', 'DUPLICATE', 'SKIPPED');

-- CreateTable
CREATE TABLE "device_test_mappings" (
    "id" TEXT NOT NULL,
    "laboratory_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "lab_service_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_test_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_logs" (
    "id" TEXT NOT NULL,
    "laboratory_id" TEXT,
    "device_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "value" TEXT,
    "status" "IngestionStatus" NOT NULL,
    "sample_test_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_test_mappings_laboratory_id_device_id_idx" ON "device_test_mappings"("laboratory_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_test_mappings_laboratory_id_device_id_device_code_key" ON "device_test_mappings"("laboratory_id", "device_id", "device_code");

-- CreateIndex
CREATE INDEX "ingestion_logs_laboratory_id_created_at_idx" ON "ingestion_logs"("laboratory_id", "created_at");

-- CreateIndex
CREATE INDEX "ingestion_logs_barcode_idx" ON "ingestion_logs"("barcode");

-- AddForeignKey
ALTER TABLE "device_test_mappings" ADD CONSTRAINT "device_test_mappings_laboratory_id_fkey" FOREIGN KEY ("laboratory_id") REFERENCES "laboratories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_test_mappings" ADD CONSTRAINT "device_test_mappings_lab_service_id_fkey" FOREIGN KEY ("lab_service_id") REFERENCES "lab_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_logs" ADD CONSTRAINT "ingestion_logs_laboratory_id_fkey" FOREIGN KEY ("laboratory_id") REFERENCES "laboratories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
