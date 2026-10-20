-- AlterTable
ALTER TABLE "designs" ADD COLUMN     "idempotency_hash" TEXT,
ADD COLUMN     "idempotency_key" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "designs_user_id_idempotency_key_key" ON "designs"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
