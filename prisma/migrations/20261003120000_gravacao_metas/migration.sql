-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "kpiId" TEXT;

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "transcript" TEXT;

-- CreateIndex
CREATE INDEX "Action_kpiId_idx" ON "Action"("kpiId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

