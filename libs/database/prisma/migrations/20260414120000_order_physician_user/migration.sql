-- AlterTable
ALTER TABLE "orders" ADD COLUMN "physician_user_id" TEXT;

-- CreateIndex
CREATE INDEX "orders_physician_user_id_laboratory_id_idx" ON "orders"("physician_user_id", "laboratory_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_physician_user_id_fkey" FOREIGN KEY ("physician_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
