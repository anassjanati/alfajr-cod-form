CREATE TABLE "MetaTrackingSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pixelId" TEXT,
    "accessTokenEncrypted" TEXT,
    "browserPixelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "testEventCode" TEXT,
    "lastEventStatus" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "lastEventError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaTrackingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaTrackingSettings_shop_key" ON "MetaTrackingSettings"("shop");
