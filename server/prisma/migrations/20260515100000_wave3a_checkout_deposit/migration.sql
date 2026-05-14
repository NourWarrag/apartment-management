-- Add DepositStatus enum
CREATE TYPE "DepositStatus" AS ENUM ('NONE', 'HELD', 'RELEASED', 'FORFEITED');

-- Add deposit + checkout columns to Booking
ALTER TABLE "Booking" ADD COLUMN "depositAmount" DECIMAL(10,2);
ALTER TABLE "Booking" ADD COLUMN "depositStatus" "DepositStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Booking" ADD COLUMN "depositRefundAmount" DECIMAL(10,2);
ALTER TABLE "Booking" ADD COLUMN "depositCollectedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "checkedOutAt" TIMESTAMP(3);
