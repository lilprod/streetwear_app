-- CreateEnum
CREATE TYPE "production_job_status" AS ENUM ('queued', 'rendering', 'ready_to_print', 'printed', 'failed');

-- CreateTable
CREATE TABLE "production_jobs" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "operator_id" UUID,
    "status" "production_job_status" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_jobs_order_id_key" ON "production_jobs"("order_id");

-- CreateIndex
CREATE INDEX "production_jobs_status_idx" ON "production_jobs"("status");

