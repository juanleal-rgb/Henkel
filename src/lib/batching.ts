import type { ClassifiedPO, POActionType } from "./classification";

export interface SupplierGroup {
  supplierNumber: number;
  supplierName: string;
  facility: string | null;
  pos: ClassifiedPO[];
  totalValue: number;
  actionTypes: POActionType[];
  poCount: number;
}

export interface BatchCreateInput {
  supplierId: string;
  supplierNumber: number;
  supplierName: string;
  pos: ClassifiedPO[];
  totalValue: number;
  actionTypes: POActionType[];
  priority: number;
}

/**
 * Group classified POs by supplier
 * Each supplier gets one batch containing all their POs
 */
export function groupBySupplier(pos: ClassifiedPO[]): SupplierGroup[] {
  const groups = new Map<number, SupplierGroup>();

  for (const po of pos) {
    let group = groups.get(po.supplierNumber);

    if (!group) {
      group = {
        supplierNumber: po.supplierNumber,
        supplierName: po.supplierName,
        facility: po.facility,
        pos: [],
        totalValue: 0,
        actionTypes: [],
        poCount: 0,
      };
      groups.set(po.supplierNumber, group);
    }

    group.pos.push(po);
    group.totalValue += po.calculatedTotalValue;
    group.poCount++;

    // Track unique action types
    if (!group.actionTypes.includes(po.actionType)) {
      group.actionTypes.push(po.actionType);
    }
  }

  // Convert to array and sort by total value (highest first)
  return Array.from(groups.values()).sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Calculate priority score for a batch
 * Higher value = higher priority (called first)
 * We use negative value as the score so higher values have lower scores
 * in Redis sorted sets (which sort ascending by default)
 */
export function calculatePriority(totalValue: number): number {
  // Return negative value so higher values sort first
  // Score of -17000000 will come before -14000000
  return -totalValue;
}

/**
 * Split a supplier group into multiple batches if it exceeds maxPOsPerBatch
 */
export function splitIntoBatches(group: SupplierGroup, maxPOsPerBatch: number): SupplierGroup[] {
  if (group.pos.length <= maxPOsPerBatch) {
    return [group];
  }

  const batches: SupplierGroup[] = [];
  const sortedPOs = [...group.pos].sort((a, b) => b.calculatedTotalValue - a.calculatedTotalValue);

  for (let i = 0; i < sortedPOs.length; i += maxPOsPerBatch) {
    const batchPOs = sortedPOs.slice(i, i + maxPOsPerBatch);
    const batchValue = batchPOs.reduce((sum, po) => sum + po.calculatedTotalValue, 0);
    const batchActionTypes = Array.from(new Set(batchPOs.map((po) => po.actionType)));

    batches.push({
      supplierNumber: group.supplierNumber,
      supplierName: group.supplierName,
      facility: group.facility,
      pos: batchPOs,
      totalValue: batchValue,
      actionTypes: batchActionTypes,
      poCount: batchPOs.length,
    });
  }

  return batches;
}

/**
 * Create batches from classified POs
 * Groups by supplier, optionally splits large groups, calculates priority
 */
export function createBatches(
  pos: ClassifiedPO[],
  options: { maxPOsPerBatch?: number } = {}
): {
  batches: SupplierGroup[];
  stats: {
    totalBatches: number;
    totalPOs: number;
    totalValue: number;
    byActionType: Record<POActionType, number>;
  };
} {
  // Default to 15 POs per batch - keeps calls manageable
  // 50+ POs in one call is impractical
  const { maxPOsPerBatch = 15 } = options;

  // Group by supplier
  const groups = groupBySupplier(pos);

  // Split large groups if needed
  const batches: SupplierGroup[] = [];
  for (const group of groups) {
    const splitBatches = splitIntoBatches(group, maxPOsPerBatch);
    batches.push(...splitBatches);
  }

  // Calculate stats
  const totalValue = batches.reduce((sum, b) => sum + b.totalValue, 0);
  const byActionType: Record<POActionType, number> = {
    CANCEL: 0,
    EXPEDITE: 0,
    PUSH_OUT: 0,
  };

  for (const batch of batches) {
    for (const po of batch.pos) {
      byActionType[po.actionType]++;
    }
  }

  return {
    batches,
    stats: {
      totalBatches: batches.length,
      totalPOs: pos.length,
      totalValue,
      byActionType,
    },
  };
}

/**
 * Get a summary of batches for display
 */
export function getBatchSummary(batches: SupplierGroup[]): {
  supplierName: string;
  supplierNumber: number;
  poCount: number;
  totalValue: number;
  actionTypes: POActionType[];
}[] {
  return batches.map((b) => ({
    supplierName: b.supplierName,
    supplierNumber: b.supplierNumber,
    poCount: b.poCount,
    totalValue: b.totalValue,
    actionTypes: b.actionTypes,
  }));
}
