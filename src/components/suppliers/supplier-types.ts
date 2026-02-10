// Supplier Component Types

import type { BatchStatus, POActionType } from "@/lib/validators";

// Supplier data from API
export interface SupplierData {
  id: string;
  supplierNumber: string;
  name: string;
  phone: string;
  email?: string | null;
  contactName?: string | null;
  notes?: string | null;
  facility?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Batch data for supplier page
export interface SupplierBatch {
  id: string;
  status: BatchStatus;
  actionTypes: POActionType[];
  totalValue: number;
  poCount: number;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  scheduledFor?: string | null;
  lastOutcome?: string | null;
  lastOutcomeReason?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastAgentRun?: {
    id: string;
    status: string;
    outcome?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    externalId?: string | null;
    externalUrl?: string | null;
  } | null;
}

// Stats by status/action
export interface StatsSummary {
  count: number;
  totalValue: number;
}

// Supplier stats from API
export interface SupplierStats {
  totalValue: number;
  totalPOs: number;
  totalBatches: number;
  byStatus: Record<string, StatsSummary>;
  byActionType: Record<string, StatsSummary>;
}

// Full supplier response
export interface SupplierDetailResponse {
  supplier: SupplierData;
  stats: SupplierStats;
  batches: SupplierBatch[];
  purchaseOrders?: {
    items: SupplierPO[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
    };
  } | null;
}

// PO in batch/supplier context
export interface SupplierPO {
  id: string;
  poNumber: string;
  poLine: number;
  partNumber: string;
  description?: string | null;
  actionType: POActionType;
  status: string;
  dueDate: string;
  recommendedDate?: string | null;
  quantityBalance: number;
  calculatedTotalValue: number;
  batchId?: string | null;
  createdAt: string;
}

// Batch filter options
export type BatchFilterStatus = "all" | BatchStatus;
