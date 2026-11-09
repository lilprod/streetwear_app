-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('tmoney', 'flooz', 'card');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('full', 'deposit', 'balance');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'expired', 'refunded');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "method" "payment_method" NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "amount_xof" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "provider_ref" TEXT,
    "idempotency_key" UUID NOT NULL,
    "idempotency_hash" TEXT NOT NULL,
    "payer_phone" TEXT,
    "next_action" JSONB,
    "failure_reason" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "raw_body" TEXT NOT NULL,
    "raw" JSONB,
    "signature_valid" BOOLEAN NOT NULL,
    "outcome" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "matched" INTEGER NOT NULL,
    "mismatches" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_status_idx" ON "payments"("order_id", "status");

-- CreateIndex
CREATE INDEX "payments_created_at_id_idx" ON "payments"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "payments_provider_created_at_idx" ON "payments"("provider", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- CreateIndex
CREATE INDEX "payment_events_provider_provider_ref_idx" ON "payment_events"("provider", "provider_ref");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE INDEX "reconciliations_date_id_idx" ON "reconciliations"("date" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_date_provider_key" ON "reconciliations"("date", "provider");

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SP05 : FK vers orders (modèle SP04) posée en SQL ; montant strictement positif.
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_xof_positive" CHECK ("amount_xof" > 0);
