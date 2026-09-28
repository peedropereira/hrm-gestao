-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "demandId" TEXT,
ADD COLUMN     "inboxItemId" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "needId" TEXT,
ADD COLUMN     "noteId" TEXT,
ADD COLUMN     "sectorId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_ownerId_createdAt_idx" ON "Attachment"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_sectorId_idx" ON "Attachment"("sectorId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_needId_fkey" FOREIGN KEY ("needId") REFERENCES "Need"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

