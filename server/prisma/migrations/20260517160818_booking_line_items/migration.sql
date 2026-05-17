-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cleaningFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parkingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "serviceCharge" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "cleaningTaxable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parkingTaxable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rentTaxable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serviceChargeTaxable" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: existing bookings' totalAmount becomes the initial rentAmount.
-- Other components stay at the default 0. SystemSettings booleans use their Prisma defaults.
-- Note: legacy totalAmount is tax-inclusive; rentAmount inherits this. Edits to legacy
-- bookings (Task 3) follow the resolution policy in this plan's "Open design issue" section.
UPDATE "Booking"
SET "rentAmount" = "totalAmount"
WHERE "rentAmount" = 0;
