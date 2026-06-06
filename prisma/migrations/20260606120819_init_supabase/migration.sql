-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "buttonText" TEXT NOT NULL DEFAULT 'Commander en paiement à la livraison',
    "buttonColor" TEXT NOT NULL DEFAULT '#0D47C7',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "borderRadius" INTEGER NOT NULL DEFAULT 14,
    "popupTitle" TEXT NOT NULL DEFAULT 'Commande rapide',
    "successPageUrl" TEXT NOT NULL DEFAULT '/pages/merci-commande',
    "showFullName" BOOLEAN NOT NULL DEFAULT true,
    "showPhone" BOOLEAN NOT NULL DEFAULT true,
    "showCity" BOOLEAN NOT NULL DEFAULT true,
    "showAddress" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotentRequest" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorTheme" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT true,
    "buttonColor" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColorTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "estimatedDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "shippingFee" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotification" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "senderEmail" TEXT,
    "sendToMerchant" BOOLEAN NOT NULL DEFAULT true,
    "sendToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodSettings_shop_key" ON "CodSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotentRequest_idempotencyKey_key" ON "IdempotentRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IdempotentRequest_shop_idx" ON "IdempotentRequest"("shop");

-- CreateIndex
CREATE INDEX "IdempotentRequest_createdAt_idx" ON "IdempotentRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ColorTheme_shop_idx" ON "ColorTheme"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ColorTheme_shop_name_key" ON "ColorTheme"("shop", "name");

-- CreateIndex
CREATE INDEX "ShippingZone_shop_idx" ON "ShippingZone"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingZone_shop_zone_key" ON "ShippingZone"("shop", "zone");

-- CreateIndex
CREATE INDEX "CodOrder_shop_idx" ON "CodOrder"("shop");

-- CreateIndex
CREATE INDEX "CodOrder_createdAt_idx" ON "CodOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailNotification_shop_key" ON "EmailNotification"("shop");
