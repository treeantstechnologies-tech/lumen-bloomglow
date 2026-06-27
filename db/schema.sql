-- Glowbloom database schema (PostgreSQL)
-- Matches backend/prisma/schema.prisma exactly.
-- Idempotent: safe to run multiple times — it skips objects that already exist.
-- Run in pgAdmin against your AWS DB, or use `npx prisma db push` from backend/.

-- ---------- Enums (create only if missing) ----------
DO $$ BEGIN
  CREATE TYPE "Provider" AS ENUM ('GOOGLE', 'META', 'APPLE', 'EMAIL', 'MOBILE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GameMode" AS ENUM ('JOURNEY', 'DAILY', 'BLOOMSTORM', 'ZEN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- User ----------
CREATE TABLE IF NOT EXISTS "User" (
  "id"               TEXT PRIMARY KEY,
  "email"            TEXT NOT NULL,
  "emailVerified"    BOOLEAN NOT NULL DEFAULT false,
  "mobile"           TEXT,
  "mobileVerified"   BOOLEAN NOT NULL DEFAULT false,
  "displayName"      TEXT,
  "avatarUrl"        TEXT,
  "locale"           TEXT NOT NULL DEFAULT 'en',
  "birthYear"        INTEGER,
  "isMinor"          BOOLEAN NOT NULL DEFAULT false,
  "parentalConsent"  BOOLEAN NOT NULL DEFAULT false,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"  ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_mobile_key" ON "User"("mobile");
CREATE INDEX        IF NOT EXISTS "User_email_idx"  ON "User"("email");
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "initialProvider" "Provider";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;

-- ---------- AuthProvider ----------
CREATE TABLE IF NOT EXISTS "AuthProvider" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "provider"       "Provider" NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthProvider_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthProvider_provider_providerUserId_key"
  ON "AuthProvider"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "AuthProvider_userId_idx" ON "AuthProvider"("userId");

-- ---------- VerificationCode ----------
CREATE TABLE IF NOT EXISTS "VerificationCode" (
  "id"        TEXT PRIMARY KEY,
  "target"    TEXT NOT NULL,
  "channel"   "Provider" NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumed"  BOOLEAN NOT NULL DEFAULT false,
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VerificationCode_target_idx" ON "VerificationCode"("target");

-- ---------- Score ----------
CREATE TABLE IF NOT EXISTS "Score" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "mode"        "GameMode" NOT NULL DEFAULT 'JOURNEY',
  "light"       INTEGER NOT NULL,
  "level"       INTEGER NOT NULL DEFAULT 1,
  "maxRadiance" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "dailySeed"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Score_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Score_userId_idx"         ON "Score"("userId");
CREATE INDEX IF NOT EXISTS "Score_mode_dailySeed_idx" ON "Score"("mode", "dailySeed");

-- ---------- Glade ----------
CREATE TABLE IF NOT EXISTS "Glade" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "totalLight" INTEGER NOT NULL DEFAULT 0,
  "floraJson"  TEXT NOT NULL DEFAULT '[]',
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Glade_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Glade_userId_key" ON "Glade"("userId");

-- ---------- DailyPattern ----------
CREATE TABLE IF NOT EXISTS "DailyPattern" (
  "id"        TEXT PRIMARY KEY,
  "date"      DATE NOT NULL,
  "seed"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyPattern_date_key" ON "DailyPattern"("date");

-- ===================== Auth & Consent logs (added v0.2) =====================
DO $$ BEGIN
  CREATE TYPE "AuthEvent" AS ENUM ('REGISTER', 'LOGIN', 'LOGOUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConsentDoc" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING', 'ADS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AuthLog" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT,
  "event"      "AuthEvent" NOT NULL,
  "method"     "Provider",
  "success"    BOOLEAN NOT NULL DEFAULT true,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "platform"   TEXT,
  "device"     TEXT,
  "osVersion"  TEXT,
  "appVersion" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthLog_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuthLog_userId_idx"    ON "AuthLog"("userId");
CREATE INDEX IF NOT EXISTS "AuthLog_event_idx"     ON "AuthLog"("event");
CREATE INDEX IF NOT EXISTS "AuthLog_createdAt_idx" ON "AuthLog"("createdAt");

CREATE TABLE IF NOT EXISTS "ConsentLog" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT,
  "doc"       "ConsentDoc" NOT NULL,
  "version"   TEXT NOT NULL,
  "accepted"  BOOLEAN NOT NULL DEFAULT true,
  "ip"        TEXT,
  "userAgent" TEXT,
  "platform"  TEXT,
  "device"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentLog_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ConsentLog_userId_idx" ON "ConsentLog"("userId");
CREATE INDEX IF NOT EXISTS "ConsentLog_doc_idx"    ON "ConsentLog"("doc");
