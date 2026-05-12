-- CreateEnum
CREATE TYPE "ApartmentType" AS ENUM ('STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'PENTHOUSE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('VERIFIED', 'PENDING', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "TenantTier" AS ENUM ('NEW', 'SILVER', 'GOLD', 'PLATINUM');

-- AlterTable
ALTER TABLE "Apartment" ADD COLUMN     "type" "ApartmentType" NOT NULL DEFAULT 'STUDIO';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tier" "TenantTier" NOT NULL DEFAULT 'NEW';
