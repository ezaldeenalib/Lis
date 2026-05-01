-- CreateEnum
CREATE TYPE "WhatsAppSendStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_send_logs" (
    "id" TEXT NOT NULL,
    "laboratory_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "order_id" TEXT,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message_preview" VARCHAR(500),
    "status" "WhatsAppSendStatus" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_send_logs_laboratory_id_created_at_idx" ON "whatsapp_send_logs"("laboratory_id", "created_at");

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_laboratory_id_fkey" FOREIGN KEY ("laboratory_id") REFERENCES "laboratories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_send_logs" ADD CONSTRAINT "whatsapp_send_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
