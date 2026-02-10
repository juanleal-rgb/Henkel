import Redis from "ioredis";

const getRedisUrl = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  return url;
};

// Lazy-loaded Redis client singleton
let redisClient: Redis | null = null;

export const getRedis = () => {
  if (!redisClient) {
    redisClient = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });
  }
  return redisClient;
};

// Subscriber client (dedicated for subscriptions - always creates new instance)
export const createSubscriber = () => {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  });
};

// Event channels
export const CHANNELS = {
  AGENT_EVENTS: "agent:events",
  CALL_EVENTS: "call:events",
  LEAD_EVENTS: "lead:events",
  PIPELINE_EVENTS: "pipeline:events",
  BATCH_LOGS: "batch:logs", // Pattern: batch:logs:{batchId}
} as const;

// Event types
export type AgentEvent = {
  type:
    | "CALL_STARTED"
    | "CALL_ENDED"
    | "AGENT_SPEAKING"
    | "LEAD_SPEAKING"
    | "ESCALATION_TRIGGERED"
    | "RUN_COMPLETED"
    | "RUN_FAILED"
    | "RUN_STATUS_CHANGED"
    | "NOTE_ADDED"
    | "STAGE_CHANGED";
  data: Record<string, unknown>;
  timestamp: string;
};

// Pipeline event types
export type PipelineEvent =
  | {
      type: "batch_queued";
      batchId: string;
      supplierId: string;
      value: number;
      poCount: number;
      actionTypes: string[];
    }
  | {
      type: "batch_started";
      batchId: string;
      supplierId: string;
      externalUrl?: string;
    }
  | {
      type: "batch_completed";
      batchId: string;
      supplierId: string;
      outcome: "success" | "partial" | "failed";
      reason?: string;
    }
  | {
      type: "batch_retry";
      batchId: string;
      supplierId: string;
      attemptCount: number;
      scheduledFor: string;
    };

// Batch log event types
export type BatchLogEvent = {
  type: "log" | "po_update" | "status_change";
  batchId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

// Publish helper
export async function publishEvent(channel: string, event: AgentEvent) {
  const redis = getRedis();
  await redis.publish(channel, JSON.stringify(event));
}

// Publish pipeline event
export async function publishPipelineEvent(event: PipelineEvent) {
  const redis = getRedis();
  await redis.publish(CHANNELS.PIPELINE_EVENTS, JSON.stringify(event));
}

// Publish batch log event
export async function publishBatchLog(batchId: string, event: Omit<BatchLogEvent, "batchId">) {
  const redis = getRedis();
  const fullEvent: BatchLogEvent = { ...event, batchId };
  await redis.publish(`${CHANNELS.BATCH_LOGS}:${batchId}`, JSON.stringify(fullEvent));
}
