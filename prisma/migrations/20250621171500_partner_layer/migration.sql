-- Optional partner/reseller layer for stores created by an intermediate manager.
CREATE TABLE IF NOT EXISTS "Partner" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "logoUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_email_key" ON "Partner"("email");

ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

CREATE INDEX IF NOT EXISTS "Store_partnerId_idx" ON "Store"("partnerId");
CREATE INDEX IF NOT EXISTS "User_partnerId_idx" ON "User"("partnerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Store_partnerId_fkey'
  ) THEN
    ALTER TABLE "Store"
    ADD CONSTRAINT "Store_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_partnerId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
