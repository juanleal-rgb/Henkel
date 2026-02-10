/**
 * Queue Processor
 *
 * Processes batches from the Redis queue by:
 * 1. Dequeuing the highest priority batch
 * 2. Checking supplier isn't already in a call
 * 3. Triggering the call via the configured provider
 * 4. Updating batch status and publishing SSE events
 */

import { prisma } from "./prisma";
import { getRedis } from "./redis";
import { publishPipelineEvent, publishBatchLog } from "./redis";
import { getCallProvider } from "./call-provider";

const QUEUE_KEY = "po:batches:queue";
const SUPPLIER_IN_PROGRESS_KEY = "supplier:in_progress";

/**
 * Check if a supplier is currently in a call
 */
export async function isSupplierInProgress(supplierId: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.sismember(SUPPLIER_IN_PROGRESS_KEY, supplierId)) === 1;
}

/**
 * Mark supplier as in progress (prevent double-calling)
 */
export async function markSupplierInProgress(supplierId: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd(SUPPLIER_IN_PROGRESS_KEY, supplierId);
}

/**
 * Mark supplier as no longer in progress
 */
export async function markSupplierNotInProgress(supplierId: string): Promise<void> {
  const redis = getRedis();
  await redis.srem(SUPPLIER_IN_PROGRESS_KEY, supplierId);
}

/**
 * Dequeue the next batch ready for processing
 * Returns null if no batches are ready
 */
async function dequeueNextBatch(): Promise<string | null> {
  const redis = getRedis();
  const now = Date.now();

  // Get batches with score <= now (ready to process)
  // Score is negative value for priority, or timestamp for scheduled
  const results = await redis.zrangebyscore(QUEUE_KEY, "-inf", now, "LIMIT", 0, 1);

  if (results.length === 0) {
    return null;
  }

  const batchId = results[0];

  // Remove from queue atomically
  const removed = await redis.zrem(QUEUE_KEY, batchId);
  if (removed === 0) {
    // Another worker got it first
    return null;
  }

  return batchId;
}

/**
 * Process a single batch
 */
async function processBatch(batchId: string): Promise<void> {
  // Get batch with supplier and POs
  const batch = await prisma.supplierBatch.findUnique({
    where: { id: batchId },
    include: {
      supplier: true,
      purchaseOrders: true,
    },
  });

  if (!batch) {
    console.warn(`Batch ${batchId} not found, skipping`);
    return;
  }

  // Check if already processed
  if (batch.status !== "QUEUED") {
    console.log(`Batch ${batchId} is ${batch.status}, skipping`);
    return;
  }

  // Check scheduled time
  if (batch.scheduledFor && batch.scheduledFor > new Date()) {
    console.log(`Batch ${batchId} scheduled for later, re-queuing`);
    const redis = getRedis();
    await redis.zadd(QUEUE_KEY, batch.scheduledFor.getTime(), batchId);
    return;
  }

  // Check supplier not already in call
  if (await isSupplierInProgress(batch.supplierId)) {
    console.log(`Supplier ${batch.supplierId} already in progress, re-queuing batch ${batchId}`);
    const redis = getRedis();
    // Re-queue with 30 second delay
    await redis.zadd(QUEUE_KEY, Date.now() + 30000, batchId);
    return;
  }

  // Get call provider
  const provider = await getCallProvider();
  if (!provider) {
    console.error("No call provider configured, cannot process batch");
    return;
  }

  // Mark supplier as in progress
  await markSupplierInProgress(batch.supplierId);

  try {
    // Update batch to IN_PROGRESS
    await prisma.supplierBatch.update({
      where: { id: batchId },
      data: { status: "IN_PROGRESS" },
    });

    // Update POs to IN_PROGRESS
    await prisma.purchaseOrder.updateMany({
      where: { batchId },
      data: { status: "IN_PROGRESS" },
    });

    // Trigger call
    const callbackUrl = `${process.env.APP_URL || ""}/api/webhooks/happyrobot`;
    const result = await provider.triggerCall({
      batch,
      callbackUrl,
      attemptNumber: batch.attemptCount + 1,
    });

    if (!result.success) {
      // Call trigger failed
      console.error(`Failed to trigger call for batch ${batchId}:`, result.error);

      await prisma.supplierBatch.update({
        where: { id: batchId },
        data: {
          status: "FAILED",
          lastOutcome: "TRIGGER_FAILED",
          lastOutcomeReason: result.error,
          attemptCount: { increment: 1 },
        },
      });

      await prisma.purchaseOrder.updateMany({
        where: { batchId },
        data: { status: "FAILED" },
      });

      await markSupplierNotInProgress(batch.supplierId);

      // Publish failure event
      await publishPipelineEvent({
        type: "batch_completed",
        batchId,
        supplierId: batch.supplierId,
        outcome: "failed",
        reason: result.error,
      });

      return;
    }

    // Create agent run record
    await prisma.pOAgentRun.create({
      data: {
        batchId,
        externalId: result.runId,
        externalUrl: result.externalUrl,
        status: "IN_PROGRESS",
        attempt: batch.attemptCount + 1,
        startedAt: new Date(),
      },
    });

    // Update batch with attempt count
    await prisma.supplierBatch.update({
      where: { id: batchId },
      data: { attemptCount: { increment: 1 } },
    });

    // Log the event
    await prisma.pOActivityLog.create({
      data: {
        entityType: "BATCH",
        entityId: batchId,
        action: "CALL_STARTED",
        details: {
          attempt: batch.attemptCount + 1,
          runId: result.runId,
          externalUrl: result.externalUrl,
          provider: provider.name,
        },
      },
    });

    // Publish SSE event
    await publishPipelineEvent({
      type: "batch_started",
      batchId,
      supplierId: batch.supplierId,
      externalUrl: result.externalUrl,
    });

    // Publish batch log
    await publishBatchLog(batchId, {
      type: "log",
      timestamp: new Date().toISOString(),
      data: {
        message: `Call started (attempt ${batch.attemptCount + 1})`,
        level: "info",
        source: "SYSTEM",
      },
    });

    console.log(`Successfully triggered call for batch ${batchId}, run ID: ${result.runId}`);
  } catch (error) {
    console.error(`Error processing batch ${batchId}:`, error);

    // Mark supplier not in progress on error
    await markSupplierNotInProgress(batch.supplierId);

    // Update batch to failed
    await prisma.supplierBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        lastOutcome: "ERROR",
        lastOutcomeReason: error instanceof Error ? error.message : "Unknown error",
      },
    });

    await prisma.purchaseOrder.updateMany({
      where: { batchId },
      data: { status: "FAILED" },
    });

    // Publish failure event
    await publishPipelineEvent({
      type: "batch_completed",
      batchId,
      supplierId: batch.supplierId,
      outcome: "failed",
      reason: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Process the queue
 * Dequeues and processes batches until queue is empty or limit reached
 */
export async function processQueue(options: { maxBatches?: number } = {}): Promise<{
  processed: number;
  errors: number;
}> {
  const { maxBatches = 5 } = options;

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batchId = await dequeueNextBatch();

    if (!batchId) {
      // Queue is empty or no batches ready
      break;
    }

    try {
      await processBatch(batchId);
      processed++;
    } catch (error) {
      console.error(`Error processing batch ${batchId}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  suppliersInProgress: number;
}> {
  const redis = getRedis();

  const [pending, suppliersInProgress] = await Promise.all([
    redis.zcard(QUEUE_KEY),
    redis.scard(SUPPLIER_IN_PROGRESS_KEY),
  ]);

  return {
    pending,
    suppliersInProgress,
  };
}
