-- CreateTable
CREATE TABLE "catalog_device_mappings" (
    "id" TEXT NOT NULL,
    "catalog_test_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_device_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_device_mappings_catalog_test_id_idx" ON "catalog_device_mappings"("catalog_test_id");

-- CreateIndex
CREATE INDEX "catalog_device_mappings_device_id_idx" ON "catalog_device_mappings"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_device_mappings_device_id_device_code_key" ON "catalog_device_mappings"("device_id", "device_code");

-- AddForeignKey
ALTER TABLE "catalog_device_mappings" ADD CONSTRAINT "catalog_device_mappings_catalog_test_id_fkey" FOREIGN KEY ("catalog_test_id") REFERENCES "catalog_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
