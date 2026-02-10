import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers
 *
 * Returns list of suppliers with aggregated stats.
 * Supports search and pagination.
 *
 * Query params:
 * - search: Filter by name or supplier number
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Field to sort by (default: totalValue)
 * - sortOrder: asc or desc (default: desc)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const sortBy = searchParams.get("sortBy") || "totalValue";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const skip = (page - 1) * limit;

    // Build where clause
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { supplierNumber: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    // Get suppliers with aggregated data
    const [suppliers, totalCount] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              purchaseOrders: true,
              batches: true,
            },
          },
          batches: {
            select: {
              status: true,
              totalValue: true,
            },
          },
          purchaseOrders: {
            select: {
              status: true,
              actionType: true,
              calculatedTotalValue: true,
            },
          },
        },
      }),
      prisma.supplier.count({ where }),
    ]);

    // Transform and aggregate data
    const transformedSuppliers = suppliers.map((supplier) => {
      // Aggregate batch stats
      const batchStats = {
        total: supplier.batches.length,
        queued: supplier.batches.filter((b) => b.status === "QUEUED").length,
        inProgress: supplier.batches.filter((b) => b.status === "IN_PROGRESS").length,
        completed: supplier.batches.filter((b) => b.status === "COMPLETED").length,
        failed: supplier.batches.filter((b) => b.status === "FAILED").length,
      };

      // Aggregate PO stats
      const poStats = {
        total: supplier.purchaseOrders.length,
        pending: supplier.purchaseOrders.filter((p) => p.status === "PENDING").length,
        queued: supplier.purchaseOrders.filter((p) => p.status === "QUEUED").length,
        completed: supplier.purchaseOrders.filter((p) => p.status === "COMPLETED").length,
        byActionType: {
          CANCEL: supplier.purchaseOrders.filter((p) => p.actionType === "CANCEL").length,
          EXPEDITE: supplier.purchaseOrders.filter((p) => p.actionType === "EXPEDITE").length,
          PUSH_OUT: supplier.purchaseOrders.filter((p) => p.actionType === "PUSH_OUT").length,
        },
      };

      // Calculate total value
      const totalValue = supplier.purchaseOrders.reduce(
        (sum, po) => sum + po.calculatedTotalValue.toNumber(),
        0
      );

      return {
        id: supplier.id,
        supplierNumber: supplier.supplierNumber,
        name: supplier.name,
        phone: supplier.phone,
        facility: supplier.facility,
        isActive: supplier.isActive,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt,
        totalValue,
        batchStats,
        poStats,
      };
    });

    // Sort results
    transformedSuppliers.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortBy) {
        case "totalValue":
          aVal = a.totalValue;
          bVal = b.totalValue;
          break;
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "poCount":
          aVal = a.poStats.total;
          bVal = b.poStats.total;
          break;
        case "batchCount":
          aVal = a.batchStats.total;
          bVal = b.batchStats.total;
          break;
        default:
          aVal = a.totalValue;
          bVal = b.totalValue;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    return NextResponse.json({
      success: true,
      data: {
        suppliers: transformedSuppliers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}
