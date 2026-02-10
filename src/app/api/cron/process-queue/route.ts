/**
 * Cron Endpoint: Process Queue
 *
 * Triggered by cron job (e.g., Vercel Cron) to process pending batches from the queue.
 * Dequeues batches, triggers calls via the configured provider, and updates statuses.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from "next/server";
import { processQueue, getQueueStats } from "@/lib/queue-processor";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for processing

/**
 * GET /api/cron/process-queue
 *
 * Process pending batches from the queue.
 * Should be called every 30-60 seconds by a cron job.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("Unauthorized cron request attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get current queue stats before processing
    const statsBefore = await getQueueStats();

    // Process up to 5 batches per invocation
    const result = await processQueue({ maxBatches: 5 });

    // Get stats after processing
    const statsAfter = await getQueueStats();

    console.log(
      `[Cron] Processed ${result.processed} batches, ${result.errors} errors. ` +
        `Queue: ${statsBefore.pending} → ${statsAfter.pending}, ` +
        `Suppliers in progress: ${statsAfter.suppliersInProgress}`
    );

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      queue: {
        before: statsBefore.pending,
        after: statsAfter.pending,
        suppliersInProgress: statsAfter.suppliersInProgress,
      },
    });
  } catch (error) {
    console.error("[Cron] Error processing queue:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/process-queue
 *
 * Alternative POST endpoint for manual triggering or webhooks.
 * Accepts optional maxBatches parameter.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("Unauthorized cron request attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Parse optional parameters
    let maxBatches = 5;
    try {
      const body = await request.json();
      if (body.maxBatches && typeof body.maxBatches === "number") {
        maxBatches = Math.min(Math.max(1, body.maxBatches), 20); // Clamp 1-20
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Get current queue stats before processing
    const statsBefore = await getQueueStats();

    // Process batches
    const result = await processQueue({ maxBatches });

    // Get stats after processing
    const statsAfter = await getQueueStats();

    console.log(
      `[Cron] Processed ${result.processed}/${maxBatches} batches, ${result.errors} errors. ` +
        `Queue: ${statsBefore.pending} → ${statsAfter.pending}`
    );

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      maxBatches,
      queue: {
        before: statsBefore.pending,
        after: statsAfter.pending,
        suppliersInProgress: statsAfter.suppliersInProgress,
      },
    });
  } catch (error) {
    console.error("[Cron] Error processing queue:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
