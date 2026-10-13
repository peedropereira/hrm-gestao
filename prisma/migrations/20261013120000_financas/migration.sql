-- CreateEnum
CREATE TYPE "FinAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinAccountType" NOT NULL DEFAULT 'CHECKING',
    "initialBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#0e6e7e',
    "closingDay" INTEGER,
    "dueDay" INTEGER,
    "creditLimit" DECIMAL(14,2),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinCategory" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinKind" NOT NULL DEFAULT 'EXPENSE',
    "group" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'tag',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "budget" DECIMAL(14,2),
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FinCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinRecurring" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "FinKind" NOT NULL DEFAULT 'EXPENSE',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "categoryId" TEXT,
    "accountId" TEXT,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 5,
    "startMonth" DATE NOT NULL,
    "endMonth" DATE,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "autoPaid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinTransaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "FinKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATE,
    "categoryId" TEXT,
    "accountId" TEXT,
    "toAccountId" TEXT,
    "recurringId" TEXT,
    "recurringMonth" DATE,
    "installmentGroup" TEXT,
    "installmentNo" INTEGER,
    "installmentTotal" INTEGER,
    "invoiceMonth" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinAccount_ownerId_idx" ON "FinAccount"("ownerId");

-- CreateIndex
CREATE INDEX "FinCategory_ownerId_idx" ON "FinCategory"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "FinCategory_ownerId_kind_group_name_key" ON "FinCategory"("ownerId", "kind", "group", "name");

-- CreateIndex
CREATE INDEX "FinRecurring_ownerId_idx" ON "FinRecurring"("ownerId");

-- CreateIndex
CREATE INDEX "FinTransaction_ownerId_date_idx" ON "FinTransaction"("ownerId", "date");

-- CreateIndex
CREATE INDEX "FinTransaction_accountId_invoiceMonth_idx" ON "FinTransaction"("accountId", "invoiceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FinTransaction_recurringId_recurringMonth_key" ON "FinTransaction"("recurringId", "recurringMonth");

-- AddForeignKey
ALTER TABLE "FinRecurring" ADD CONSTRAINT "FinRecurring_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinRecurring" ADD CONSTRAINT "FinRecurring_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "FinRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;

