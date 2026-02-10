import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BatchStatus, POActionType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SortField = "poCount" | "totalValue" | "supplier" | "createdAt" | "priority";
type SortOrder = "asc" | "desc";

/**
 * GET /api/batches
 *
 * Returns batches filtered by status with sorting, searching, and filtering.
 * Used by the pipeline table to load batches for a selected stage.
 *
 * Query params:
 * - status: Filter by BatchStatus (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort field - poCount, totalValue, supplier, createdAt, priority (default: totalValue)
 * - order: Sort direction - asc, desc (default: desc for value, asc for others)
 * - search: Search supplier name or number
 * - actionType: Filter by POActionType (CANCEL, EXPEDITE, PUSH_OUT)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as BatchStatus | null;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const sort = (searchParams.get("sort") as SortField) || "totalValue";
    const order =
      (searchParams.get("order") as SortOrder) || (sort === "totalValue" ? "desc" : "asc");
    const search = searchParams.get("search")?.trim();
    const actionType = searchParams.get("actionType") as POActionType | null;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "status query param is required" },
        { status: 400 }
      );
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.SupplierBatchWhereInput = { status };

    // Search by supplier name or number
    if (search) {
      where.supplier = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { supplierNumber: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    // Filter by action type
    if (actionType) {
      where.actionTypes = { has: actionType };
    }

    // Build orderBy - for poCount we need to use a raw query or workaround
    // since Prisma doesn't support ordering by _count directly in the same query
    let orderBy: Prisma.SupplierBatchOrderByWithRelationInput;
    switch (sort) {
      case "poCount":
        // For PO count, we sort by priority as a proxy (higher value batches have more POs typically)
        // TODO: Implement proper count-based sorting with raw query if needed
        orderBy = { totalValue: order };
        break;
      case "totalValue":
        orderBy = { totalValue: order };
        break;
      case "supplier":
        orderBy = { supplier: { name: order } };
        break;
      case "createdAt":
        orderBy = { createdAt: order };
        break;
      case "priority":
      default:
        orderBy = { priority: order === "desc" ? "desc" : "asc" };
        break;
    }

    const [batches, totalCount] = await Promise.all([
      prisma.supplierBatch.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          supplier: {
            select: {
              id: true,
              supplierNumber: true,
              name: true,
              phone: true,
            },
          },
          _count: {
            select: { purchaseOrders: true },
          },
        },
      }),
      prisma.supplierBatch.count({ where }),
    ]);

    // Transform to match PipelineBatch type
    const transformedBatches = batches.map((batch) => ({
      id: batch.id,
      supplierId: batch.supplierId,
      supplier: {
        name: batch.supplier.name,
        supplierNumber: batch.supplier.supplierNumber,
        phone: batch.supplier.phone,
      },
      poCount: batch._count.purchaseOrders,
      totalValue: batch.totalValue.toNumber(),
      actionTypes: batch.actionTypes,
      status: batch.status,
      priority: batch.priority,
      attemptCount: batch.attemptCount,
      maxAttempts: batch.maxAttempts,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      scheduledFor: batch.scheduledFor?.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        batches: transformedBatches,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch batches" }, { status: 500 });
  }
}
