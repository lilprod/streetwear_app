-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "estimated_delivery_at" TIMESTAMP(3),
ADD COLUMN     "estimated_ready_at" TIMESTAMP(3);
