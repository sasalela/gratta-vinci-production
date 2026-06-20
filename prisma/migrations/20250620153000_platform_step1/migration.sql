-- Store branding and subscription
ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "logoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#667eea',
ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT NOT NULL DEFAULT '#764ba2',
ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);

-- Campaign configuration for dynamic forms, limits, voucher validity and future games
ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "gameType" TEXT NOT NULL DEFAULT 'scratch_card',
ADD COLUMN IF NOT EXISTS "customerFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "playLimitMode" TEXT NOT NULL DEFAULT 'per_campaign',
ADD COLUMN IF NOT EXISTS "loseMessage" TEXT NOT NULL DEFAULT 'Nessun premio questa volta.',
ADD COLUMN IF NOT EXISTS "voucherValidityDays" INTEGER NOT NULL DEFAULT 15;

-- User improvements for store login and future admin users in DB
ALTER TABLE "User"
ALTER COLUMN "storeId" DROP NOT NULL,
ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_storeId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Prize inventory controlled by each campaign
CREATE TABLE IF NOT EXISTS "Prize" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT,
  "description" TEXT,
  "winProbability" DOUBLE PRECISION NOT NULL,
  "totalQuantity" INTEGER NOT NULL,
  "remainingQuantity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Prize_campaignId_idx" ON "Prize"("campaignId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Prize_campaignId_fkey'
  ) THEN
    ALTER TABLE "Prize"
    ADD CONSTRAINT "Prize_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Participation metadata and outcome
ALTER TABLE "Participation"
ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
ADD COLUMN IF NOT EXISTS "deviceKey" TEXT,
ADD COLUMN IF NOT EXISTS "customerData" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "outcome" TEXT NOT NULL DEFAULT 'lost',
ADD COLUMN IF NOT EXISTS "prizeId" TEXT;

CREATE INDEX IF NOT EXISTS "Participation_email_campaignId_idx" ON "Participation"("email", "campaignId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Participation_prizeId_fkey'
  ) THEN
    ALTER TABLE "Participation"
    ADD CONSTRAINT "Participation_prizeId_fkey"
    FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Voucher redemption metadata
ALTER TABLE "Voucher"
ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "redeemedByUserId" TEXT;

-- Redemption history
CREATE TABLE IF NOT EXISTS "Redemption" (
  "id" TEXT NOT NULL,
  "voucherId" TEXT NOT NULL,
  "userId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Redemption_voucherId_fkey'
  ) THEN
    ALTER TABLE "Redemption"
    ADD CONSTRAINT "Redemption_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Redemption_userId_fkey'
  ) THEN
    ALTER TABLE "Redemption"
    ADD CONSTRAINT "Redemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Alerts visible to admin and store panels
CREATE TABLE IF NOT EXISTS "Alert" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "readByAdmin" BOOLEAN NOT NULL DEFAULT false,
  "readByStore" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Alert_storeId_readByStore_idx" ON "Alert"("storeId", "readByStore");
CREATE INDEX IF NOT EXISTS "Alert_readByAdmin_idx" ON "Alert"("readByAdmin");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Alert_storeId_fkey'
  ) THEN
    ALTER TABLE "Alert"
    ADD CONSTRAINT "Alert_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Alert_campaignId_fkey'
  ) THEN
    ALTER TABLE "Alert"
    ADD CONSTRAINT "Alert_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
