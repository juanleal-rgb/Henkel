import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishBatchLog, publishPipelineEvent } from "@/lib/redis";
import { completeBatch, scheduleCallback } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook payload types from HappyRobot
 */
interface LogPayload {
  event_type: "log";
  batch_id: string;
  run_id?: string;
  message: string;
  level?: "info" | "warning" | "error" | "success";
  source?: string;
  po_id?: string;
  po_outcome?: "success" | "rejected" | "pending";
}

interface POResolvedPayload {
  event_type: "po_resolved";
  batch_id: string;
  run_id?: string;
  po_id: string;
  po_number: string;
  po_line?: number;
  outcome: "success" | "failed";
  reason?: string;
}

interface CallbackRequestedPayload {
  event_type: "callback_requested";
  batch_id: string;
  run_id?: string;
  scheduled_for: string;
  reason?: string;
}

interface EscalationPayload {
  event_type: "escalation";
  batch_id: string;
  run_id?: string;
  po_id?: string;
  reason: string;
  priority?: "high" | "medium" | "low";
}

interface CallCompletePayload {
  event_type: "call_complete";
  batch_id: string;
  run_id: string;
  outcome: "success" | "partial" | "failed" | "callback";
  summary?: string;
  duration_seconds?: number;
  resolved_count?: number;
  failed_count?: number;
}

type WebhookPayload =
  | LogPayload
  | POResolvedPayload
  | CallbackRequestedPayload
  | EscalationPayload
  | CallCompletePayload;

/**
 * POST /api/webhooks/happyrobot
 *
 * Handles all webhook events from HappyRobot workflow:
 * - log: Real-time log messages
 * - po_resolved: Individual PO resolved during call
 * - callback_requested: Supplier requested callback
 * - escalation: Issue flagged for human review
 * - call_complete: Call finished with overall outcome
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== process.env.HAPPYROBOT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as WebhookPayload;
    const timestamp = new Date().toISOString();

    // Verify batch exists
    const batch = await prisma.supplierBatch.findUnique({
      where: { id: payload.batch_id },
      select: { id: true, supplierId: true, status: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    switch (payload.event_type) {
      case "log": {
        // Real-time log message from agent
        const logLevel = payload.level || "info";

        // If po_id and po_outcome provided, mark PO as resolved
        if (payload.po_id && payload.po_outcome === "success") {
          const po = await prisma.purchaseOrder.findUnique({
            where: { id: payload.po_id },
            select: {
              id: true,
              poNumber: true,
              poLine: true,
              actionType: true,
              dueDate: true,
              recommendedDate: true,
            },
          });

          if (po) {
            // Build update data
            const updateData: {
              status: "COMPLETED" | "FAILED";
              dueDate?: Date;
              originalDueDate?: Date | null;
            } = { status: "COMPLETED" };

            // If PUSH_OUT or EXPEDITE, update dueDate to recommendedDate
            if (
              (po.actionType === "PUSH_OUT" || po.actionType === "EXPEDITE") &&
              po.recommendedDate
            ) {
              updateData.originalDueDate = po.dueDate;
              updateData.dueDate = po.recommendedDate;
            }

            await prisma.purchaseOrder.update({
              where: { id: payload.po_id },
              data: updateData,
            });

            // Check if all POs in batch are now completed
            const remainingPOs = await prisma.purchaseOrder.count({
              where: {
                batchId: payload.batch_id,
                status: { in: ["QUEUED", "IN_PROGRESS"] },
              },
            });

            if (remainingPOs === 0) {
              // All POs completed - update batch status
              await prisma.supplierBatch.update({
                where: { id: payload.batch_id },
                data: {
                  status: "COMPLETED",
                  lastOutcome: "success",
                  lastOutcomeReason: "All POs confirmed",
                  completedAt: new Date(),
                },
              });

              // Remove from processing queue
              await completeBatch(payload.batch_id);

              // Wait 1 second before showing completion message
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Persist completion log to database
              await prisma.batchLog.create({
                data: {
                  batchId: payload.batch_id,
                  type: "status_change",
                  level: "success",
                  message: "All POs confirmed - batch completed",
                  data: {
                    outcome: "success",
                  },
                },
              });

              // Publish batch completion to SSE
              await publishBatchLog(payload.batch_id, {
                type: "status_change",
                timestamp: new Date().toISOString(),
                data: {
                  outcome: "success",
                  message: "All POs confirmed - batch completed",
                },
              });

              // Publish to pipeline SSE
              await publishPipelineEvent({
                type: "batch_completed",
                batchId: payload.batch_id,
                supplierId: batch.supplierId,
                outcome: "success",
                reason: "All POs confirmed",
              });
            }
          }

          // Always publish PO update to SSE for real-time UI update
          await publishBatchLog(payload.batch_id, {
            type: "po_update",
            timestamp,
            data: {
              poId: payload.po_id,
              poNumber: po?.poNumber,
              poLine: po?.poLine,
              newStatus: "COMPLETED",
              outcome: "success",
            },
          });
        } else if (payload.po_id && payload.po_outcome === "rejected") {
          await prisma.purchaseOrder.update({
            where: { id: payload.po_id },
            data: { status: "FAILED" },
          });

          // Publish PO update to SSE for rejected status
          await publishBatchLog(payload.batch_id, {
            type: "po_update",
            timestamp,
            data: {
              poId: payload.po_id,
              newStatus: "FAILED",
              outcome: "failed",
            },
          });
        }

        // Persist log to database
        await prisma.batchLog.create({
          data: {
            batchId: payload.batch_id,
            type: "log",
            level: logLevel,
            message: payload.message,
            data: {
              source: payload.source || "AGENT",
              runId: payload.run_id,
              poId: payload.po_id,
              poOutcome: payload.po_outcome,
            },
          },
        });

        await prisma.pOActivityLog.create({
          data: {
            entityType: payload.po_id ? "PO" : "BATCH",
            entityId: payload.po_id || payload.batch_id,
            action: "LOG",
            details: {
              message: payload.message,
              level: logLevel,
              source: payload.source || "AGENT",
              runId: payload.run_id,
              poOutcome: payload.po_outcome,
            },
          },
        });

        // Publish to SSE
        await publishBatchLog(payload.batch_id, {
          type: "log",
          timestamp,
          data: {
            message: payload.message,
            level: logLevel,
            source: payload.source || "AGENT",
            poId: payload.po_id,
            poOutcome: payload.po_outcome,
          },
        });
        break;
      }

      case "po_resolved": {
        // Individual PO resolved during call
        const newStatus = payload.outcome === "success" ? "COMPLETED" : "FAILED";

        // Get the PO to check if we need to update the dueDate
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: payload.po_id },
          select: {
            id: true,
            actionType: true,
            dueDate: true,
            recommendedDate: true,
          },
        });

        // Build update data
        const updateData: {
          status: "COMPLETED" | "FAILED";
          dueDate?: Date;
          originalDueDate?: Date;
        } = { status: newStatus as "COMPLETED" | "FAILED" };

        // If PUSH_OUT or EXPEDITE was successful, update dueDate to recommendedDate
        // Store the original dueDate for history
        if (
          payload.outcome === "success" &&
          po &&
          (po.actionType === "PUSH_OUT" || po.actionType === "EXPEDITE") &&
          po.recommendedDate
        ) {
          updateData.originalDueDate = po.dueDate;
          updateData.dueDate = po.recommendedDate;
        }

        await prisma.purchaseOrder.update({
          where: { id: payload.po_id },
          data: updateData,
        });

        // Persist to BatchLog
        await prisma.batchLog.create({
          data: {
            batchId: payload.batch_id,
            type: "po_update",
            level: payload.outcome === "success" ? "success" : "error",
            message: `PO# ${payload.po_number} ${payload.outcome === "success" ? "confirmed" : "failed"}`,
            data: {
              poId: payload.po_id,
              poNumber: payload.po_number,
              poLine: payload.po_line,
              outcome: payload.outcome,
              reason: payload.reason,
              runId: payload.run_id,
            },
          },
        });

        await prisma.pOActivityLog.create({
          data: {
            entityType: "PO",
            entityId: payload.po_id,
            action: "STATUS_CHANGED",
            details: {
              batchId: payload.batch_id,
              poNumber: payload.po_number,
              poLine: payload.po_line,
              outcome: payload.outcome,
              reason: payload.reason,
              runId: payload.run_id,
              // Include date change info for audit trail
              previousDueDate: po?.dueDate?.toISOString(),
              newDueDate: updateData.dueDate?.toISOString(),
            },
          },
        });

        // Publish to SSE
        await publishBatchLog(payload.batch_id, {
          type: "po_update",
          timestamp,
          data: {
            poId: payload.po_id,
            poNumber: payload.po_number,
            poLine: payload.po_line,
            newStatus,
            outcome: payload.outcome,
            reason: payload.reason,
            // Include date change for UI update
            previousDueDate: po?.dueDate?.toISOString(),
            newDueDate: updateData.dueDate?.toISOString(),
          },
        });
        break;
      }

      case "callback_requested": {
        // Supplier requested a callback
        const scheduledFor = new Date(payload.scheduled_for);

        await prisma.supplierBatch.update({
          where: { id: payload.batch_id },
          data: {
            status: "QUEUED",
            scheduledFor,
            attemptCount: { increment: 1 },
          },
        });

        // Schedule callback in queue
        await scheduleCallback(payload.batch_id, scheduledFor);

        await prisma.pOActivityLog.create({
          data: {
            entityType: "BATCH",
            entityId: payload.batch_id,
            action: "CALLBACK_REQUESTED",
            details: {
              scheduledFor: payload.scheduled_for,
              reason: payload.reason,
              runId: payload.run_id,
            },
          },
        });

        // Publish pipeline event
        await publishPipelineEvent({
          type: "batch_retry",
          batchId: payload.batch_id,
          supplierId: batch.supplierId,
          attemptCount: 1, // Will be fetched from updated batch
          scheduledFor: payload.scheduled_for,
        });

        // Publish to batch logs
        await publishBatchLog(payload.batch_id, {
          type: "status_change",
          timestamp,
          data: {
            message: `Callback scheduled for ${new Date(payload.scheduled_for).toLocaleString()}`,
            level: "info",
            scheduledFor: payload.scheduled_for,
            reason: payload.reason,
          },
        });
        break;
      }

      case "escalation": {
        // Issue flagged for human review
        if (payload.po_id) {
          await prisma.pOConflict.create({
            data: {
              purchaseOrderId: payload.po_id,
              conflictType: "ESCALATION",
              conflictDetails: {
                batchId: payload.batch_id,
                reason: payload.reason,
                priority: payload.priority || "medium",
                runId: payload.run_id,
              },
            },
          });
        }

        await prisma.pOActivityLog.create({
          data: {
            entityType: payload.po_id ? "PO" : "BATCH",
            entityId: payload.po_id || payload.batch_id,
            action: "ESCALATION",
            details: {
              batchId: payload.batch_id,
              poId: payload.po_id,
              reason: payload.reason,
              priority: payload.priority || "medium",
              runId: payload.run_id,
            },
          },
        });

        // Publish to SSE
        await publishBatchLog(payload.batch_id, {
          type: "log",
          timestamp,
          data: {
            message: `Escalation: ${payload.reason}`,
            level: "warning",
            source: "AGENT",
            poId: payload.po_id,
            priority: payload.priority,
          },
        });
        break;
      }

      case "call_complete": {
        // Call finished - update batch status
        const outcomeToStatus = {
          success: "COMPLETED",
          partial: "PARTIAL",
          failed: "FAILED",
          callback: "QUEUED",
        } as const;

        const newStatus = outcomeToStatus[payload.outcome];

        await prisma.supplierBatch.update({
          where: { id: payload.batch_id },
          data: {
            status: newStatus,
            lastOutcome: payload.outcome,
            lastOutcomeReason: payload.summary,
            completedAt: payload.outcome !== "callback" ? new Date() : null,
          },
        });

        // Update agent run record
        if (payload.run_id) {
          await prisma.pOAgentRun.updateMany({
            where: {
              externalId: payload.run_id,
              batchId: payload.batch_id,
            },
            data: {
              status: newStatus === "COMPLETED" ? "COMPLETED" : "FAILED",
              outcome: payload.outcome,
              endedAt: new Date(),
              duration: payload.duration_seconds,
            },
          });
        }

        // Remove from processing queue
        await completeBatch(payload.batch_id);

        await prisma.pOActivityLog.create({
          data: {
            entityType: "BATCH",
            entityId: payload.batch_id,
            action: "CALL_COMPLETE",
            details: {
              outcome: payload.outcome,
              summary: payload.summary,
              durationSeconds: payload.duration_seconds,
              resolvedCount: payload.resolved_count,
              failedCount: payload.failed_count,
              runId: payload.run_id,
            },
          },
        });

        // Publish pipeline event
        await publishPipelineEvent({
          type: "batch_completed",
          batchId: payload.batch_id,
          supplierId: batch.supplierId,
          outcome: payload.outcome === "callback" ? "failed" : payload.outcome,
          reason: payload.summary,
        });

        // Persist to BatchLog
        const callCompleteLevel =
          payload.outcome === "success"
            ? "success"
            : payload.outcome === "partial"
              ? "warning"
              : "error";

        await prisma.batchLog.create({
          data: {
            batchId: payload.batch_id,
            type: "status_change",
            level: callCompleteLevel,
            message: `Call completed: ${payload.outcome}`,
            data: {
              outcome: payload.outcome,
              summary: payload.summary,
              resolvedCount: payload.resolved_count,
              failedCount: payload.failed_count,
              runId: payload.run_id,
            },
          },
        });

        // Publish to batch logs
        await publishBatchLog(payload.batch_id, {
          type: "status_change",
          timestamp,
          data: {
            message: `Call completed: ${payload.outcome}`,
            level: callCompleteLevel,
            outcome: payload.outcome,
            summary: payload.summary,
            resolvedCount: payload.resolved_count,
            failedCount: payload.failed_count,
          },
        });
        break;
      }

      default:
        console.warn("Unknown webhook event type:", (payload as { event_type: string }).event_type);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
