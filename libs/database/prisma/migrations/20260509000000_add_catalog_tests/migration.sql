-- CreateTable: Global Medical Test Catalog (platform-controlled, no laboratory_id)
CREATE TABLE "catalog_tests" (
    "id"          TEXT         NOT NULL,
    "code"        TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "name_ar"     TEXT,
    "category"    TEXT,
    "department"  TEXT,
    "sample_type" TEXT,
    "unit"        TEXT,
    "description" TEXT,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique code across global catalog
CREATE UNIQUE INDEX "catalog_tests_code_key" ON "catalog_tests"("code");

-- AlterTable: add optional link from LabService → CatalogTest (backward-compatible)
ALTER TABLE "lab_services" ADD COLUMN "catalog_test_id" TEXT;

-- CreateIndex on lab_services.catalog_test_id
CREATE INDEX "lab_services_catalog_test_id_idx" ON "lab_services"("catalog_test_id");

-- AddForeignKey: lab_services.catalog_test_id → catalog_tests.id (SET NULL on delete)
ALTER TABLE "lab_services"
    ADD CONSTRAINT "lab_services_catalog_test_id_fkey"
    FOREIGN KEY ("catalog_test_id")
    REFERENCES "catalog_tests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
