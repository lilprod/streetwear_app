-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_payment', 'payment_failed', 'expired', 'paid', 'deposit_paid', 'in_production', 'ready', 'shipped', 'ready_for_pickup', 'delivered', 'delivery_failed', 'returned', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "reception_type" AS ENUM ('home', 'pickup');

-- CreateEnum
CREATE TYPE "order_payment_method" AS ENUM ('tmoney', 'flooz', 'card', 'cod');

-- CreateEnum
CREATE TYPE "order_actor_type" AS ENUM ('system', 'admin', 'customer', 'provider');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('in', 'reserve', 'release', 'out', 'adjust');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending_payment',
    "subtotal_xof" INTEGER NOT NULL,
    "delivery_fee_xof" INTEGER NOT NULL,
    "total_xof" INTEGER NOT NULL,
    "vat_included_xof" INTEGER NOT NULL,
    "payment_method" "order_payment_method" NOT NULL,
    "deposit_xof" INTEGER,
    "reception_type" "reception_type" NOT NULL,
    "reception_snapshot" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "idempotency_key" UUID NOT NULL,
    "idempotency_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "design_id" UUID,
    "design_snapshot" JSONB NOT NULL,
    "preview_front_url" TEXT,
    "preview_back_url" TEXT,
    "color_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_xof" INTEGER NOT NULL,
    "print_file_front_url" TEXT,
    "print_file_back_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "actor_type" "order_actor_type" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "color_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "alert_threshold" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "order_id" UUID,
    "admin_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_design_id_idx" ON "cart_items"("design_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_design_id_size_key" ON "cart_items"("cart_id", "design_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_status_created_at_id_idx" ON "orders"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_id_idx" ON "orders"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_design_id_idx" ON "order_items"("design_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_color_id_size_key" ON "stock_items"("color_id", "size");

-- CreateIndex
CREATE INDEX "stock_movements_stock_item_id_created_at_idx" ON "stock_movements"("stock_item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "tshirt_colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "tshirt_colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Essais du code de retrait (5 maximum)
ALTER TABLE "pickups" ADD COLUMN "code_attempts" INTEGER NOT NULL DEFAULT 0;

-- Numéro de commande lisible (TG-000001)
CREATE SEQUENCE "order_number_seq" START 1;

-- Contraintes métier
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_size_check" CHECK ("size" IN ('XS','S','M','L','XL','2XL','3XL'));
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 50);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_size_check" CHECK ("size" IN ('XS','S','M','L','XL','2XL','3XL'));
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 50);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_check" CHECK ("unit_price_xof" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("subtotal_xof" >= 0 AND "delivery_fee_xof" >= 0 AND "total_xof" = "subtotal_xof" + "delivery_fee_xof" AND ("deposit_xof" IS NULL OR "deposit_xof" BETWEEN 0 AND "total_xof"));
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_size_check" CHECK ("size" IN ('XS','S','M','L','XL','2XL','3XL'));
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_quantities_check" CHECK ("reserved" >= 0 AND "on_hand" >= "reserved" AND "alert_threshold" >= 0);

-- Les mouvements de stock sont immuables (TRUNCATE reste possible pour les bases de test)
CREATE FUNCTION "stock_movements_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "stock_movements_no_update_delete" BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_immutable"();

