-- CreateEnum
CREATE TYPE "BrokerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BrokerAgentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FLAT');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "agentId" INTEGER,
ADD COLUMN     "brokerId" INTEGER,
ADD COLUMN     "commissionAmount" DECIMAL(10,2),
ADD COLUMN     "commissionType" "CommissionType";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "defaultAgentId" INTEGER;

-- CreateTable
CREATE TABLE "Broker" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "taxRegistrationNumber" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "status" "BrokerStatus" NOT NULL DEFAULT 'ACTIVE',
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENT',
    "defaultCommissionValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "deletedBy" INTEGER,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerAgent" (
    "id" SERIAL NOT NULL,
    "brokerId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "idNumber" TEXT,
    "notes" TEXT,
    "status" "BrokerAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "commissionType" "CommissionType",
    "commissionValueOverride" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "deletedBy" INTEGER,

    CONSTRAINT "BrokerAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broker_status_deletedAt_idx" ON "Broker"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "BrokerAgent_brokerId_status_idx" ON "BrokerAgent"("brokerId", "status");

-- CreateIndex
CREATE INDEX "BrokerAgent_brokerId_deletedAt_idx" ON "BrokerAgent"("brokerId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_defaultAgentId_fkey" FOREIGN KEY ("defaultAgentId") REFERENCES "BrokerAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAgent" ADD CONSTRAINT "BrokerAgent_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAgent" ADD CONSTRAINT "BrokerAgent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAgent" ADD CONSTRAINT "BrokerAgent_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerAgent" ADD CONSTRAINT "BrokerAgent_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "BrokerAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
