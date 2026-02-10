import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearQueues } from "@/lib/queue";
import { requireAdmin, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/reset
 *
 * Resets all data back to initial state (state 0).
 * Clears: Redis queues, batches, conflicts, POs, suppliers.
 * Requires ADMIN role.
 */
export async function POST() {
  // Require admin authentication
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    // Clear Redis queues
    await clearQueues();
    console.log("Redis queues cleared");

    // Delete in order to respect foreign key constraints
    await prisma.pOAgentRun.deleteMany({});
    console.log("Agent runs deleted");

    await prisma.supplierBatch.deleteMany({});
    console.log("Batches deleted");

    await prisma.pOConflict.deleteMany({});
    console.log("Conflicts deleted");

    await prisma.purchaseOrder.deleteMany({});
    console.log("POs deleted");

    await prisma.supplier.deleteMany({});
    console.log("Suppliers deleted");

    return NextResponse.json({
      success: true,
      message: "All data reset to initial state",
    });
  } catch (error) {
    console.error("Error resetting data:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reset data",
      },
      { status: 500 }
    );
  }
}
