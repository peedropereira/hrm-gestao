
-- CreateTable
CREATE TABLE "FinGoal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "saved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deadline" DATE,
    "color" TEXT NOT NULL DEFAULT '#0e6e7e',
    "icon" TEXT NOT NULL DEFAULT 'piggy-bank',
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinGoalEntry" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinGoalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinGoal_ownerId_idx" ON "FinGoal"("ownerId");

-- CreateIndex
CREATE INDEX "FinGoalEntry_goalId_date_idx" ON "FinGoalEntry"("goalId", "date");

-- AddForeignKey
ALTER TABLE "FinGoalEntry" ADD CONSTRAINT "FinGoalEntry_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

