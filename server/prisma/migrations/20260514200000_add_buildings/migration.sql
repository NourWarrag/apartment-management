-- CreateTable
CREATE TABLE "Building" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- Seed default building BEFORE adding buildingId column so it gets id = 1
INSERT INTO "Building" (name, code, address, "createdAt", "updatedAt")
VALUES ('Main Building', 'MB', '', NOW(), NOW());

-- AlterTable: add buildingId with DEFAULT 1 so existing rows get assigned to Main Building
ALTER TABLE "Apartment" ADD COLUMN "buildingId" INTEGER NOT NULL DEFAULT 1;

-- Drop the column-level default; app must always supply buildingId explicitly going forward
ALTER TABLE "Apartment" ALTER COLUMN "buildingId" DROP DEFAULT;

-- DropIndex: remove old single-column unique on number
DROP INDEX "Apartment_number_key";

-- CreateIndex: add compound unique on (buildingId, number)
CREATE UNIQUE INDEX "Apartment_buildingId_number_key" ON "Apartment"("buildingId", "number");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
