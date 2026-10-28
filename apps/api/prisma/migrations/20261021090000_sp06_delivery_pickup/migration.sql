-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('to_assign', 'assigned', 'in_progress', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "fee_xof" INTEGER NOT NULL,
    "delay_hours" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "address_snapshot" JSONB NOT NULL,
    "zone_id" UUID NOT NULL,
    "fee_xof" INTEGER NOT NULL,
    "courier_id" UUID,
    "handover_code_hash" TEXT NOT NULL,
    "handover_attempts" INTEGER NOT NULL DEFAULT 0,
    "cod_balance_xof" INTEGER,
    "cod_collected_xof" INTEGER,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'to_assign',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "fail_reason" TEXT,
    "fail_note" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "opening_hours" JSONB NOT NULL,
    "default_slot_capacity" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_slots" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pickup_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "pickup_code_hash" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "couriers_admin_user_id_key" ON "couriers"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_courier_id_scheduled_for_idx" ON "deliveries"("courier_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "deliveries_scheduled_for_status_idx" ON "deliveries"("scheduled_for", "status");

-- CreateIndex
CREATE INDEX "pickup_slots_store_id_starts_at_idx" ON "pickup_slots"("store_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_slots_store_id_starts_at_key" ON "pickup_slots"("store_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_order_id_key" ON "pickups"("order_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_slots" ADD CONSTRAINT "pickup_slots_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "pickup_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- booked <= capacity (règle transactionnelle 3)
ALTER TABLE "pickup_slots" ADD CONSTRAINT "pickup_slots_booked_check" CHECK ("booked" >= 0 AND "booked" <= "capacity");
