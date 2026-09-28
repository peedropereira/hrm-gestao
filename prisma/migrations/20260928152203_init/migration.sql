-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEADER');

-- CreateEnum
CREATE TYPE "ActionOrigin" AS ENUM ('MEETING', 'DEMAND', 'KPI', 'CAPTURE', 'VISIT');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('DO', 'DELEGATE', 'FOLLOW_UP', 'DECIDE');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UpdateKind" AS ENUM ('COMMENT', 'FOLLOW_UP', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('PENDING', 'TRIAGED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "NeedCategory" AS ENUM ('PEOPLE', 'EQUIPMENT', 'INVESTMENT', 'TRAINING', 'PROCESS');

-- CreateEnum
CREATE TYPE "NeedStatus" AS ENUM ('RAISED', 'ANALYSIS', 'APPROVED', 'FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MEETING', 'CLIENT_VISIT', 'TECH_VISIT', 'AUDIT', 'SECTOR_MEETING', 'PERSONAL_BLOCK', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorAccess" (
    "userId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,

    CONSTRAINT "SectorAccess_pkey" PRIMARY KEY ("userId","sectorId")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "redOverdueMin" INTEGER NOT NULL DEFAULT 2,
    "kpiRedPercent" INTEGER NOT NULL DEFAULT 10,
    "delegateAlertDays" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "sectorId" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sectorId" TEXT,
    "origin" "ActionOrigin" NOT NULL DEFAULT 'CAPTURE',
    "originNote" TEXT,
    "demandId" TEXT,
    "eventId" TEXT,
    "assigneeId" TEXT,
    "kind" "ActionKind" NOT NULL DEFAULT 'DO',
    "dueDate" DATE,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActionStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "lastFollowUpAt" TIMESTAMP(3),
    "alertAfterDays" INTEGER,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionUpdate" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "kind" "UpdateKind" NOT NULL DEFAULT 'COMMENT',
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "updateId" TEXT,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPriority" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "position" INTEGER NOT NULL,
    "actionId" TEXT NOT NULL,

    CONSTRAINT "DailyPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'PENDING',
    "convertedTo" TEXT,
    "convertedId" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triagedAt" TIMESTAMP(3),

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "source" TEXT,
    "receivedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "DemandStatus" NOT NULL DEFAULT 'OPEN',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Need" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "category" "NeedCategory" NOT NULL,
    "estimatedCost" DECIMAL(14,2),
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "NeedStatus" NOT NULL DEFAULT 'RAISED',
    "decidedAt" TIMESTAMP(3),
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Need_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sectorId" TEXT,
    "content" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sectorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" "KpiDirection" NOT NULL,
    "target" DECIMAL(14,4) NOT NULL,
    "source" TEXT,
    "template" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiEntry" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "target" DECIMAL(14,4),

    CONSTRAINT "KpiEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'MEETING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "sectorId" TEXT,
    "demandId" TEXT,
    "rrule" TEXT,
    "minutes" TEXT,
    "externalId" TEXT,
    "externalSource" TEXT,
    "etag" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ActionToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ActionToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DemandToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DemandToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NeedToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NeedToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NoteToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NoteToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "LoginAttempt_login_createdAt_idx" ON "LoginAttempt"("login", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_ownerId_slug_key" ON "Sector"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "Person_ownerId_idx" ON "Person"("ownerId");

-- CreateIndex
CREATE INDEX "Action_ownerId_status_dueDate_idx" ON "Action"("ownerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Action_sectorId_status_idx" ON "Action"("sectorId", "status");

-- CreateIndex
CREATE INDEX "DailyPriority_ownerId_date_idx" ON "DailyPriority"("ownerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPriority_ownerId_date_actionId_key" ON "DailyPriority"("ownerId", "date", "actionId");

-- CreateIndex
CREATE INDEX "InboxItem_ownerId_status_idx" ON "InboxItem"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Demand_ownerId_sectorId_idx" ON "Demand"("ownerId", "sectorId");

-- CreateIndex
CREATE INDEX "Need_ownerId_sectorId_idx" ON "Need"("ownerId", "sectorId");

-- CreateIndex
CREATE INDEX "Note_ownerId_sectorId_idx" ON "Note"("ownerId", "sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");

-- CreateIndex
CREATE INDEX "ActivityLog_ownerId_sectorId_createdAt_idx" ON "ActivityLog"("ownerId", "sectorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KpiEntry_kpiId_month_key" ON "KpiEntry"("kpiId", "month");

-- CreateIndex
CREATE INDEX "Event_ownerId_startsAt_idx" ON "Event"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "_ActionToTag_B_index" ON "_ActionToTag"("B");

-- CreateIndex
CREATE INDEX "_DemandToTag_B_index" ON "_DemandToTag"("B");

-- CreateIndex
CREATE INDEX "_NeedToTag_B_index" ON "_NeedToTag"("B");

-- CreateIndex
CREATE INDEX "_NoteToTag_B_index" ON "_NoteToTag"("B");

-- AddForeignKey
ALTER TABLE "SectorAccess" ADD CONSTRAINT "SectorAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectorAccess" ADD CONSTRAINT "SectorAccess_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionUpdate" ADD CONSTRAINT "ActionUpdate_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "ActionUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPriority" ADD CONSTRAINT "DailyPriority_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Need" ADD CONSTRAINT "Need_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiEntry" ADD CONSTRAINT "KpiEntry_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActionToTag" ADD CONSTRAINT "_ActionToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActionToTag" ADD CONSTRAINT "_ActionToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DemandToTag" ADD CONSTRAINT "_DemandToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DemandToTag" ADD CONSTRAINT "_DemandToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NeedToTag" ADD CONSTRAINT "_NeedToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Need"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NeedToTag" ADD CONSTRAINT "_NeedToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NoteToTag" ADD CONSTRAINT "_NoteToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NoteToTag" ADD CONSTRAINT "_NoteToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
