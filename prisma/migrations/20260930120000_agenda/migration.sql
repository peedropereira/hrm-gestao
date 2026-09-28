-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "attendees" TEXT,
ADD COLUMN     "exdates" DATE[] DEFAULT ARRAY[]::DATE[],
ADD COLUMN     "linkedActionId" TEXT,
ADD COLUMN     "occurrenceDate" DATE,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Event_parentId_idx" ON "Event"("parentId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_linkedActionId_fkey" FOREIGN KEY ("linkedActionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

