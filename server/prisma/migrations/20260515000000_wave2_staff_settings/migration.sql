-- Add new enum values to Role
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE 'BUILDING_ADMIN';

-- Add assignedBuildingId to User
ALTER TABLE "User" ADD COLUMN "assignedBuildingId" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_assignedBuildingId_fkey"
  FOREIGN KEY ("assignedBuildingId") REFERENCES "Building"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create SystemSettings table
CREATE TABLE "SystemSettings" (
  "id"          SERIAL PRIMARY KEY,
  "companyName" TEXT NOT NULL DEFAULT 'My Property',
  "currency"    TEXT NOT NULL DEFAULT 'AED',
  "timezone"    TEXT NOT NULL DEFAULT 'Asia/Dubai',
  "phone"       TEXT NOT NULL DEFAULT '',
  "email"       TEXT NOT NULL DEFAULT '',
  "address"     TEXT NOT NULL DEFAULT ''
);
