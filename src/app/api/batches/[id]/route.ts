import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/batches/[id]
 *
 * Returns batch details with supplier info and all POs in the batch.
 * Used when clicking a batch in the pipeline table.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const batch = await prisma.supplierBatch.findUnique({
      where: { id: params.id },
      include: {
        supplier: {
          select: {
            id: true,
            supplierNumber: true,
            name: true,
            phone: true,
            facility: true,
          },
        },
        purchaseOrders: {
          orderBy: { calculatedTotalValue: "desc" },
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
            createdAt: true,
          },
        },
        agentRuns: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            outcome: true,
            outcomeReason: true,
            attempt: true,
            startedAt: true,
            endedAt: true,
            duration: true,
            externalId: true,
            externalUrl: true,
          },
        },
        logs: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            level: true,
            message: true,
            data: true,
            createdAt: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }

    // Transform Decimal fields to numbers
    const transformedBatch = {
      ...batch,
      totalValue: batch.totalValue.toNumber(),
      purchaseOrders: batch.purchaseOrders.map((po) => ({
        ...po,
        quantityBalance: po.quantityBalance.toNumber(),
        calculatedTotalValue: po.calculatedTotalValue.toNumber(),
      })),
    };

    return NextResponse.json({
      success: true,
      data: transformedBatch,
    });
  } catch (error) {
    console.error("Error fetching batch:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch batch" }, { status: 500 });
  }
}
