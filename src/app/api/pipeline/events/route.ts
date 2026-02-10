import { NextRequest } from "next/server";
import { createSubscriber, CHANNELS, type PipelineEvent } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline/events
 *
 * Server-Sent Events endpoint for real-time pipeline updates.
 * Streams batch state changes as they happen.
 *
 * Events:
 * - batch_queued: Batch moved from PENDING to QUEUED
 * - batch_started: Batch call started (IN_PROGRESS)
 * - batch_completed: Batch call finished (success/partial/failed)
 * - batch_retry: Batch scheduled for retry
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a dedicated subscriber for this connection
  const subscriber = createSubscriber();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let heartbeat: NodeJS.Timeout | null = null;

      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        if (heartbeat) clearInterval(heartbeat);
        try {
          subscriber.unsubscribe(CHANNELS.PIPELINE_EVENTS).catch(() => {});
          subscriber.quit().catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
        try {
          controller.close();
        } catch {
          // Controller already closed
        }
      };

      const sendEvent = (event: PipelineEvent) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
          safeClose();
        }
      };

      // Send initial connection event
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
      } catch {
        safeClose();
        return;
      }

      // Handle Redis errors
      subscriber.on("error", (err) => {
        console.error("Redis subscriber error:", err.message);
        safeClose();
      });

      subscriber.on("close", () => {
        safeClose();
      });

      // Subscribe to pipeline events
      subscriber.subscribe(CHANNELS.PIPELINE_EVENTS, (err) => {
        if (err) {
          console.error("Failed to subscribe to pipeline events:", err);
          safeClose();
        }
      });

      // Handle incoming messages
      subscriber.on("message", (channel, message) => {
        if (channel === CHANNELS.PIPELINE_EVENTS && !isClosed) {
          try {
            const event = JSON.parse(message) as PipelineEvent;
            sendEvent(event);
          } catch (e) {
            console.error("Failed to parse pipeline event:", e);
          }
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        safeClose();
      });

      // Keep connection alive with heartbeat every 30 seconds
      heartbeat = setInterval(() => {
        if (isClosed) {
          if (heartbeat) clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          safeClose();
        }
      }, 30000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
