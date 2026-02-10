import { getRedis } from "./redis";

// Queue keys
export const QUEUE_KEYS = {
  PRIMARY: "po:queue:primary", // Main queue - sorted by priority (negative total value)
  CALLBACKS: "po:queue:callbacks", // Callback queue - sorted by scheduled time
  PROCESSING: "po:queue:processing", // Currently being processed
} as const;

// Queue stats
export interface QueueStats {
  primary: {
    count: number;
    totalValue: number;
  };
  callbacks: {
    count: number;
    nextScheduled: Date | null;
  };
  processing: {
    count: number;
  };
}

/**
 * Add a batch to the primary queue
 * Score is negative total value so higher values come first
 */
export async function enqueueBatch(batchId: string, priority: number): Promise<void> {
  const redis = getRedis();
  await redis.zadd(QUEUE_KEYS.PRIMARY, priority, batchId);
}

/**
 * Add multiple batches to the primary queue
 */
export async function enqueueBatches(
  batches: Array<{ batchId: string; priority: number }>
): Promise<void> {
  if (batches.length === 0) return;

  const redis = getRedis();
  const args: (string | number)[] = [];

  for (const { batchId, priority } of batches) {
    args.push(priority, batchId);
  }

  await redis.zadd(QUEUE_KEYS.PRIMARY, ...args);
}

/**
 * Get the next batch from the primary queue (highest priority = lowest score)
 * Moves it to the processing set
 */
export async function dequeueBatch(): Promise<string | null> {
  const redis = getRedis();

  // Get the batch with the lowest score (highest priority)
  const result = await redis.zpopmin(QUEUE_KEYS.PRIMARY, 1);

  if (!result || result.length === 0) {
    return null;
  }

  const batchId = result[0];

  // Add to processing set with current timestamp
  await redis.zadd(QUEUE_KEYS.PROCESSING, Date.now(), batchId);

  return batchId;
}

/**
 * Peek at the next batches without removing them
 */
export async function peekQueue(limit = 10): Promise<Array<{ batchId: string; score: number }>> {
  const redis = getRedis();
  const results = await redis.zrange(QUEUE_KEYS.PRIMARY, 0, limit - 1, "WITHSCORES");

  const batches: Array<{ batchId: string; score: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    batches.push({
      batchId: results[i],
      score: parseFloat(results[i + 1]),
    });
  }

  return batches;
}

/**
 * Schedule a callback for a batch
 * Score is the timestamp when the callback should be processed
 */
export async function scheduleCallback(batchId: string, scheduledFor: Date): Promise<void> {
  const redis = getRedis();
  await redis.zadd(QUEUE_KEYS.CALLBACKS, scheduledFor.getTime(), batchId);
}

/**
 * Get callbacks that are due (scheduled time <= now)
 */
export async function getDueCallbacks(limit = 10): Promise<string[]> {
  const redis = getRedis();
  const now = Date.now();

  // Get callbacks with score <= now
  const results = await redis.zrangebyscore(QUEUE_KEYS.CALLBACKS, 0, now, "LIMIT", 0, limit);

  return results;
}

/**
 * Remove a callback from the queue (after processing or cancellation)
 */
export async function removeCallback(batchId: string): Promise<void> {
  const redis = getRedis();
  await redis.zrem(QUEUE_KEYS.CALLBACKS, batchId);
}

/**
 * Mark a batch as completed (remove from processing)
 */
export async function completeBatch(batchId: string): Promise<void> {
  const redis = getRedis();
  await redis.zrem(QUEUE_KEYS.PROCESSING, batchId);
}

/**
 * Return a batch to the queue (e.g., if processing failed)
 */
export async function requeueBatch(batchId: string, priority: number): Promise<void> {
  const redis = getRedis();

  // Remove from processing
  await redis.zrem(QUEUE_KEYS.PROCESSING, batchId);

  // Add back to primary queue
  await redis.zadd(QUEUE_KEYS.PRIMARY, priority, batchId);
}

/**
 * Check if a batch is in any queue
 */
export async function getBatchQueueStatus(
  batchId: string
): Promise<"primary" | "callbacks" | "processing" | null> {
  const redis = getRedis();

  const [inPrimary, inCallbacks, inProcessing] = await Promise.all([
    redis.zscore(QUEUE_KEYS.PRIMARY, batchId),
    redis.zscore(QUEUE_KEYS.CALLBACKS, batchId),
    redis.zscore(QUEUE_KEYS.PROCESSING, batchId),
  ]);

  if (inPrimary !== null) return "primary";
  if (inCallbacks !== null) return "callbacks";
  if (inProcessing !== null) return "processing";
  return null;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const redis = getRedis();

  const [primaryCount, callbacksCount, processingCount, nextCallback] = await Promise.all([
    redis.zcard(QUEUE_KEYS.PRIMARY),
    redis.zcard(QUEUE_KEYS.CALLBACKS),
    redis.zcard(QUEUE_KEYS.PROCESSING),
    redis.zrange(QUEUE_KEYS.CALLBACKS, 0, 0, "WITHSCORES"),
  ]);

  // Calculate total value in primary queue
  // We stored negative values, so we need to negate and sum
  const primaryScores = await redis.zrange(QUEUE_KEYS.PRIMARY, 0, -1, "WITHSCORES");
  let totalValue = 0;
  for (let i = 1; i < primaryScores.length; i += 2) {
    totalValue += Math.abs(parseFloat(primaryScores[i]));
  }

  return {
    primary: {
      count: primaryCount,
      totalValue,
    },
    callbacks: {
      count: callbacksCount,
      nextScheduled: nextCallback.length >= 2 ? new Date(parseFloat(nextCallback[1])) : null,
    },
    processing: {
      count: processingCount,
    },
  };
}

/**
 * Clear all queues (for testing/reset)
 */
export async function clearQueues(): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    redis.del(QUEUE_KEYS.PRIMARY),
    redis.del(QUEUE_KEYS.CALLBACKS),
    redis.del(QUEUE_KEYS.PROCESSING),
  ]);
}

/**
 * Remove a batch from all queues
 */
export async function removeBatchFromQueues(batchId: string): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    redis.zrem(QUEUE_KEYS.PRIMARY, batchId),
    redis.zrem(QUEUE_KEYS.CALLBACKS, batchId),
    redis.zrem(QUEUE_KEYS.PROCESSING, batchId),
  ]);
}
