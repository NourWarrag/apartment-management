-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ON_CALL', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('MAINTENANCE', 'CLEANING');

-- AlterTable
ALTER TABLE "Apartment" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "buildingId" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MaintenanceTicket" ADD COLUMN     "type" "TicketType" NOT NULL DEFAULT 'MAINTENANCE',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "staffStatus" "StaffStatus" NOT NULL DEFAULT 'OFF_DUTY',
ALTER COLUMN "updatedAt" DROP DEFAULT;
