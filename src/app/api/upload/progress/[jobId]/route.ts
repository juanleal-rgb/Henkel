import { NextRequest } from "next/server";
import { getUploadJob } from "@/lib/upload-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let lastUpdate = 0;
      let attempts = 0;
      const maxAttempts = 1800; // 15 minutes max (1800 * 500ms)

      const poll = async () => {
        attempts++;

        if (attempts > maxAttempts) {
          sendEvent({ type: "timeout", message: "Upload timed out" });
          controller.close();
          return;
        }

        try {
          const job = await getUploadJob(jobId);

          if (!job) {
            sendEvent({ type: "error", message: "Job not found" });
            controller.close();
            return;
          }

          // Only send updates when something changed
          if (job.updatedAt > lastUpdate) {
            lastUpdate = job.updatedAt;

            if (job.status === "complete") {
              sendEvent({
                type: "complete",
                progress: job.progress,
                result: job.result,
              });
              controller.close();
              return;
            }

            if (job.status === "error") {
              sendEvent({
                type: "error",
                progress: job.progress,
                error: job.error,
              });
              controller.close();
              return;
            }

            // Send progress update
            sendEvent({
              type: "progress",
              progress: job.progress,
              status: job.status,
            });
          }

          // Continue polling
          setTimeout(poll, 500);
        } catch (error) {
          console.error("SSE polling error:", error);
          sendEvent({ type: "error", message: "Internal error" });
          controller.close();
        }
      };

      // Start polling
      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
