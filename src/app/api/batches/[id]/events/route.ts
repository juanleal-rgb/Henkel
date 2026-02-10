import { NextRequest } from "next/server";
import { createSubscriber, CHANNELS, type BatchLogEvent } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/batches/[id]/events
 *
 * Server-Sent Events endpoint for real-time batch logs.
 * Streams HappyRobot call updates, PO status changes, and agent logs.
 *
 * Events:
 * - log: Text log message from the agent
 * - po_update: PO status changed during call
 * - status_change: Batch status changed
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;

  // Verify batch exists
  const batch = await prisma.supplierBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true },
  });

  if (!batch) {
    return new Response(JSON.stringify({ error: "Batch not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const subscriber = createSubscriber();
  const channel = `${CHANNELS.BATCH_LOGS}:${batchId}`;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: BatchLogEvent | { type: string; [key: string]: unknown }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      // Send initial connection event with batch status
      sendEvent({
        type: "connected",
        batchId,
        currentStatus: batch.status,
      });

      // Subscribe to batch-specific logs
      subscriber.subscribe(channel, (err) => {
        if (err) {
          console.error(`Failed to subscribe to batch logs for ${batchId}:`, err);
          controller.close();
        }
      });

      // Handle incoming messages
      subscriber.on("message", (ch, message) => {
        if (ch === channel) {
          try {
            const event = JSON.parse(message) as BatchLogEvent;
            sendEvent(event);
          } catch (e) {
            console.error("Failed to parse batch log event:", e);
          }
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        subscriber.unsubscribe(channel);
        subscriber.quit();
        controller.close();
      });

      // Keep connection alive with heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
