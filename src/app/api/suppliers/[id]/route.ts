import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/[id]
 *
 * Returns supplier details with batches and POs.
 *
 * Query params:
 * - includePOs: Include all POs (default: false, returns only summary)
 * - poStatus: Filter POs by status
 * - poPage: Page for POs (default: 1)
 * - poLimit: Limit for POs (default: 50)
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const includePOs = searchParams.get("includePOs") === "true";
    const poStatus = searchParams.get("poStatus");
    const poPage = parseInt(searchParams.get("poPage") || "1", 10);
    const poLimit = Math.min(parseInt(searchParams.get("poLimit") || "50", 10), 100);

    // Get supplier with batches
    const supplier = await prisma.supplier.findUnique({
      where: { id: params.id },
      include: {
        batches: {
          orderBy: { totalValue: "desc" },
          include: {
            _count: {
              select: { purchaseOrders: true },
            },
            agentRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                outcome: true,
                startedAt: true,
                endedAt: true,
                externalId: true,
                externalUrl: true,
              },
            },
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ success: false, error: "Supplier not found" }, { status: 404 });
    }

    // Build PO query
    const poWhere: Record<string, unknown> = { supplierId: params.id };
    if (poStatus) {
      poWhere.status = poStatus;
    }

    // Get POs with pagination (if requested) or just counts
    const [pos, poCount] = await Promise.all([
      includePOs
        ? prisma.purchaseOrder.findMany({
            where: poWhere,
            orderBy: { calculatedTotalValue: "desc" },
            skip: (poPage - 1) * poLimit,
            take: poLimit,
            select: {
              id: true,
              poNumber: true,
              poLine: true,
              partNumber: true,
              description: true,
              actionType: true,
              status: true,
              dueDate: true,
              recommendedDate: true,
              quantityBalance: true,
              calculatedTotalValue: true,
              batchId: true,
              createdAt: true,
            },
          })
        : [],
      prisma.purchaseOrder.count({ where: poWhere }),
    ]);

    // Get aggregated stats
    const [poStats, actionTypeStats] = await Promise.all([
      prisma.purchaseOrder.groupBy({
        by: ["status"],
        where: { supplierId: params.id },
        _count: { id: true },
        _sum: { calculatedTotalValue: true },
      }),
      prisma.purchaseOrder.groupBy({
        by: ["actionType"],
        where: { supplierId: params.id },
        _count: { id: true },
        _sum: { calculatedTotalValue: true },
      }),
    ]);

    // Transform batch data
    const transformedBatches = supplier.batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      actionTypes: batch.actionTypes,
      totalValue: batch.totalValue.toNumber(),
      poCount: batch._count.purchaseOrders,
      priority: batch.priority,
      attemptCount: batch.attemptCount,
      maxAttempts: batch.maxAttempts,
      scheduledFor: batch.scheduledFor,
      lastOutcome: batch.lastOutcome,
      lastOutcomeReason: batch.lastOutcomeReason,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      completedAt: batch.completedAt,
      lastAgentRun: batch.agentRuns[0] || null,
    }));

    // Transform PO data
    const transformedPOs = pos.map((po) => ({
      ...po,
      quantityBalance: po.quantityBalance.toNumber(),
      calculatedTotalValue: po.calculatedTotalValue.toNumber(),
    }));

    // Build stats summary
    const statsByStatus: Record<string, { count: number; totalValue: number }> = {};
    for (const stat of poStats) {
      statsByStatus[stat.status] = {
        count: stat._count.id,
        totalValue: stat._sum.calculatedTotalValue?.toNumber() || 0,
      };
    }

    const statsByActionType: Record<string, { count: number; totalValue: number }> = {};
    for (const stat of actionTypeStats) {
      statsByActionType[stat.actionType] = {
        count: stat._count.id,
        totalValue: stat._sum.calculatedTotalValue?.toNumber() || 0,
      };
    }

    // Calculate totals
    const totalValue = Object.values(statsByStatus).reduce((sum, s) => sum + s.totalValue, 0);
    const totalPOs = Object.values(statsByStatus).reduce((sum, s) => sum + s.count, 0);

    return NextResponse.json({
      success: true,
      data: {
        supplier: {
          id: supplier.id,
          supplierNumber: supplier.supplierNumber,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          contactName: supplier.contactName,
          notes: supplier.notes,
          facility: supplier.facility,
          isActive: supplier.isActive,
          createdAt: supplier.createdAt,
          updatedAt: supplier.updatedAt,
        },
        stats: {
          totalValue,
          totalPOs,
          totalBatches: supplier.batches.length,
          byStatus: statsByStatus,
          byActionType: statsByActionType,
        },
        batches: transformedBatches,
        purchaseOrders: includePOs
          ? {
              items: transformedPOs,
              pagination: {
                page: poPage,
                limit: poLimit,
                totalCount: poCount,
                totalPages: Math.ceil(poCount / poLimit),
              },
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch supplier" },
      { status: 500 }
    );
  }
}
