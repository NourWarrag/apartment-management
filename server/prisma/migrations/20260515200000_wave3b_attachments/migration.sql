-- Add AttachmentEntity enum
CREATE TYPE "AttachmentEntity" AS ENUM ('APARTMENT', 'TENANT', 'BOOKING', 'TICKET');

-- Create Attachment table
CREATE TABLE "Attachment" (
  "id" SERIAL NOT NULL,
  "entityType" "AttachmentEntity" NOT NULL,
  "entityId" INTEGER NOT NULL,
  "filename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- Foreign key to User
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for entity lookups
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");
