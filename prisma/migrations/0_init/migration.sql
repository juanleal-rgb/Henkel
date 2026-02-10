-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CANCEL', 'EXPEDITE', 'PUSH_OUT');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "SupplierBatchStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "POAgentRunStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "supplierNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "facility" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poLine" INTEGER NOT NULL DEFAULT 0,
    "actionType" "ActionType" NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" DATE,
    "recommendedDate" DATE,
    "totalValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "supplierId" TEXT NOT NULL,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBatch" (
    "id" TEXT NOT NULL,
    "status" "SupplierBatchStatus" NOT NULL DEFAULT 'QUEUED',
    "actionTypes" JSONB NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "externalId" TEXT,
    "externalUrl" TEXT,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POAgentRun" (
    "id" TEXT NOT NULL,
    "status" "POAgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "data" JSONB DEFAULT '{}',
    "batchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POConflict" (
    "id" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "resolution" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "poId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB DEFAULT '{}',
    "userId" TEXT NOT NULL,
    "poId" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_supplierNumber_key" ON "Supplier"("supplierNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_batchId_idx" ON "PurchaseOrder"("batchId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_actionType_idx" ON "PurchaseOrder"("actionType");

-- CreateIndex
CREATE INDEX "SupplierBatch_supplierId_idx" ON "SupplierBatch"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierBatch_status_idx" ON "SupplierBatch"("status");

-- CreateIndex
CREATE INDEX "POAgentRun_batchId_idx" ON "POAgentRun"("batchId");

-- CreateIndex
CREATE INDEX "BatchLog_batchId_idx" ON "BatchLog"("batchId");

-- CreateIndex
CREATE INDEX "POConflict_poId_idx" ON "POConflict"("poId");

-- CreateIndex
CREATE INDEX "POActivityLog_userId_idx" ON "POActivityLog"("userId");

-- CreateIndex
CREATE INDEX "POActivityLog_poId_idx" ON "POActivityLog"("poId");

-- CreateIndex
CREATE INDEX "POActivityLog_batchId_idx" ON "POActivityLog"("batchId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SupplierBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBatch" ADD CONSTRAINT "SupplierBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POAgentRun" ADD CONSTRAINT "POAgentRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SupplierBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchLog" ADD CONSTRAINT "BatchLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SupplierBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POConflict" ADD CONSTRAINT "POConflict_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POActivityLog" ADD CONSTRAINT "POActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POActivityLog" ADD CONSTRAINT "POActivityLog_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POActivityLog" ADD CONSTRAINT "POActivityLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SupplierBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
