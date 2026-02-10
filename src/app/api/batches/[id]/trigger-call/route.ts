import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCallProvider } from "@/lib/call-provider";
import { publishPipelineEvent, publishBatchLog } from "@/lib/redis";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TriggerCallRequest {
  phoneOverride?: string;
  emailOverride?: string;
}

/**
 * POST /api/batches/[id]/trigger-call
 *
 * Manually trigger a call for a QUEUED batch.
 * Moves batch to IN_PROGRESS and triggers HappyRobot workflow.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Require authentication
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  try {
    const body: TriggerCallRequest = await request.json().catch(() => ({}));

    // Get batch with supplier and POs
    const batch = await prisma.supplierBatch.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrders: {
          where: {
            status: { in: ["QUEUED", "PENDING"] },
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Only allow triggering QUEUED batches
    if (batch.status !== "QUEUED") {
      return NextResponse.json(
        {
          error: "Invalid batch status",
          message: `Batch is ${batch.status}, must be QUEUED to trigger call`,
        },
        { status: 400 }
      );
    }

    // Get call provider
    const provider = await getCallProvider();
    if (!provider) {
      return NextResponse.json(
        {
          error: "No call provider configured",
          message: "Set HAPPYROBOT_WEBHOOK_URL environment variable",
        },
        { status: 503 }
      );
    }

    // Update batch status to IN_PROGRESS
    await prisma.supplierBatch.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        attemptCount: { increment: 1 },
      },
    });

    // Update all POs in batch to IN_PROGRESS
    await prisma.purchaseOrder.updateMany({
      where: { batchId: id },
      data: { status: "IN_PROGRESS" },
    });

    // Build callback URL
    const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/webhooks/happyrobot`;

    // Trigger the call
    const result = await provider.triggerCall({
      batch,
      callbackUrl,
      attemptNumber: batch.attemptCount + 1,
      phoneOverride: body.phoneOverride,
      emailOverride: body.emailOverride,
    });

    if (!result.success) {
      // Rollback status on failure
      await prisma.supplierBatch.update({
        where: { id },
        data: {
          status: "QUEUED",
          attemptCount: { decrement: 1 },
        },
      });

      await prisma.purchaseOrder.updateMany({
        where: { batchId: id },
        data: { status: "QUEUED" },
      });

      return NextResponse.json(
        {
          error: "Failed to trigger call",
          message: result.error,
        },
        { status: 500 }
      );
    }

    // Create agent run record
    await prisma.pOAgentRun.create({
      data: {
        batchId: id,
        externalId: result.runId,
        externalUrl: result.externalUrl,
        status: "IN_PROGRESS",
        attempt: batch.attemptCount + 1,
        startedAt: new Date(),
      },
    });

    // Update batch with HappyRobot run ID
    await prisma.supplierBatch.update({
      where: { id },
      data: {
        happyRobotRunId: result.runId,
      },
    });

    // Log the event
    const timestamp = new Date().toISOString();

    await prisma.batchLog.create({
      data: {
        batchId: id,
        type: "status_change",
        level: "info",
        message: "Call started",
        data: {
          runId: result.runId,
          externalUrl: result.externalUrl,
          phoneUsed: body.phoneOverride || batch.supplier.phone,
          attempt: batch.attemptCount + 1,
        },
      },
    });

    await prisma.pOActivityLog.create({
      data: {
        entityType: "BATCH",
        entityId: id,
        action: "CALL_STARTED",
        userId: auth.user.id,
        details: {
          runId: result.runId,
          externalUrl: result.externalUrl,
          phoneUsed: body.phoneOverride || batch.supplier.phone,
          attempt: batch.attemptCount + 1,
          triggeredBy: auth.user.email,
        },
      },
    });

    // Publish SSE events
    await publishPipelineEvent({
      type: "batch_started",
      batchId: id,
      supplierId: batch.supplierId,
      externalUrl: result.externalUrl,
    });

    await publishBatchLog(id, {
      type: "status_change",
      timestamp,
      data: {
        message: "Call started",
        level: "info",
        runId: result.runId,
        externalUrl: result.externalUrl,
      },
    });

    return NextResponse.json({
      success: true,
      runId: result.runId,
      externalUrl: result.externalUrl,
      message: `Call triggered for ${batch.supplier.name}`,
    });
  } catch (error) {
    console.error("Trigger call error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
