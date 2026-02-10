import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BatchStatus, POActionType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/batches/stats
 *
 * Returns aggregated statistics for the dashboard:
 * - Batch counts and values by status
 * - Total POs, batches, suppliers
 * - PO counts by action type
 */
export async function GET() {
  try {
    // Run all queries in parallel for performance
    const [batchStats, poTotals, actionTypeStats, supplierCount] = await Promise.all([
      // 1. Batch counts and values grouped by status
      prisma.supplierBatch.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { totalValue: true },
      }),

      // 2. Total PO count
      prisma.purchaseOrder.count(),

      // 3. PO counts and values by action type
      prisma.purchaseOrder.groupBy({
        by: ["actionType"],
        _count: { id: true },
        _sum: { calculatedTotalValue: true },
      }),

      // 4. Unique supplier count (with at least one batch)
      prisma.supplier.count({
        where: {
          batches: {
            some: {},
          },
        },
      }),
    ]);

    // Transform batch stats into stages format
    const stages: Record<string, { count: number; totalValue: number }> = {};
    const allStatuses: BatchStatus[] = ["QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED", "PARTIAL"];

    // Initialize all stages with zero
    for (const status of allStatuses) {
      stages[status] = { count: 0, totalValue: 0 };
    }

    // Fill in actual values
    for (const stat of batchStats) {
      stages[stat.status] = {
        count: stat._count.id,
        totalValue: stat._sum.totalValue?.toNumber() || 0,
      };
    }

    // Calculate totals
    let totalBatches = 0;
    let totalValue = 0;
    for (const status of allStatuses) {
      totalBatches += stages[status].count;
      totalValue += stages[status].totalValue;
    }

    // Transform action type stats
    const actionTypes: Record<string, { count: number; totalValue: number }> = {};
    const allActionTypes: POActionType[] = ["CANCEL", "EXPEDITE", "PUSH_OUT"];

    // Initialize all action types with zero
    for (const actionType of allActionTypes) {
      actionTypes[actionType] = { count: 0, totalValue: 0 };
    }

    // Fill in actual values
    for (const stat of actionTypeStats) {
      actionTypes[stat.actionType] = {
        count: stat._count.id,
        totalValue: stat._sum.calculatedTotalValue?.toNumber() || 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        stages,
        totals: {
          batches: totalBatches,
          totalValue,
          totalPOs: poTotals,
          uniqueSuppliers: supplierCount,
        },
        actionTypes,
      },
    });
  } catch (error) {
    console.error("Error fetching batch stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch batch statistics",
      },
      { status: 500 }
    );
  }
}
