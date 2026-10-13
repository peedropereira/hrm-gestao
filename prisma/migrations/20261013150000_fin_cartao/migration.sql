-- AlterTable
ALTER TABLE "FinRecurring" ADD COLUMN     "onCard" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinTransaction" ADD COLUMN     "cardPending" BOOLEAN NOT NULL DEFAULT false;

