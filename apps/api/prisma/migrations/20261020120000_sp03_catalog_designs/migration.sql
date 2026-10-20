CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "pattern_price_tier" AS ENUM ('standard', 'premium');

-- CreateTable
CREATE TABLE "pattern_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patterns" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "price_tier" "pattern_price_tier" NOT NULL DEFAULT 'standard',
    "image_public_id" TEXT NOT NULL,
    "width_px" INTEGER NOT NULL,
    "height_px" INTEGER NOT NULL,
    "rights_holder" TEXT,
    "rights_proof_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tshirt_colors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "is_dark" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tshirt_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fonts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "file_public_id" TEXT NOT NULL,
    "license_ref" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fonts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount_xof" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "spec" JSONB NOT NULL,
    "spec_version" INTEGER NOT NULL DEFAULT 1,
    "preview_front_url" TEXT,
    "preview_back_url" TEXT,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pattern_categories_slug_key" ON "pattern_categories"("slug");

-- CreateIndex
CREATE INDEX "patterns_category_id_idx" ON "patterns"("category_id");

-- CreateIndex
CREATE INDEX "patterns_active_name_id_idx" ON "patterns"("active", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "price_rules_key_key" ON "price_rules"("key");

-- CreateIndex
CREATE UNIQUE INDEX "banned_words_word_key" ON "banned_words"("word");

-- CreateIndex
CREATE INDEX "designs_user_id_updated_at_id_idx" ON "designs"("user_id", "updated_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "pattern_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

