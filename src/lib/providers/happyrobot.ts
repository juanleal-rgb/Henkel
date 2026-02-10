/**
 * HappyRobot Call Provider
 *
 * Implements the CallProvider interface for HappyRobot AI Voice platform.
 * https://happyrobot.ai
 */

import type {
  CallProvider,
  CallBatchData,
  CallTriggerResult,
  CallStatusResult,
  CallStatus,
} from "../call-provider";

/**
 * HappyRobot webhook response
 */
interface HappyRobotTriggerResponse {
  queued_run_ids?: string[];
  status?: string;
  error?: string;
}

/**
 * HappyRobot status response from Platform API
 */
interface HappyRobotStatusResponse {
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  outcome?: string;
  duration_seconds?: number;
}

export class HappyRobotProvider implements CallProvider {
  name = "HappyRobot";

  private webhookUrl: string;
  private apiKey?: string;
  private platformApiKey?: string;
  private orgId?: string;
  private orgSlug?: string;
  private workflowId?: string;

  constructor() {
    this.webhookUrl = process.env.HAPPYROBOT_WEBHOOK_URL || "";
    this.apiKey = process.env.HAPPYROBOT_X_API_KEY;
    this.platformApiKey = process.env.HAPPYROBOT_API_KEY;
    this.orgId = process.env.HAPPYROBOT_ORG_ID;
    this.orgSlug = process.env.HAPPYROBOT_ORG_SLUG;
    this.workflowId = process.env.HAPPYROBOT_WORKFLOW_ID;

    if (!this.webhookUrl) {
      throw new Error("HAPPYROBOT_WEBHOOK_URL is required");
    }
  }

  /**
   * Trigger a call via HappyRobot webhook
   *
   * Sends batch_id and ALL POs upfront. Agent has everything it needs.
   */
  async triggerCall(data: CallBatchData): Promise<CallTriggerResult> {
    const { batch, callbackUrl, attemptNumber, phoneOverride, emailOverride } = data;

    // Use overrides if provided (from demo config)
    const supplierPhone = phoneOverride || batch.supplier.phone;
    const supplierEmail = emailOverride || batch.supplier.email;

    // Sort POs by value (highest first)
    const sortedPOs = [...batch.purchaseOrders].sort(
      (a, b) => b.calculatedTotalValue.toNumber() - a.calculatedTotalValue.toNumber()
    );

    // Build payload with batch_id and ALL POs
    const payload = {
      // Batch ID for callbacks
      batch_id: batch.id,

      // Call info
      attempt: attemptNumber,
      phone: supplierPhone,

      // Supplier info for introduction
      supplier_name: batch.supplier.name,
      supplier_number: batch.supplier.supplierNumber,
      supplier_email: supplierEmail,

      // Overview stats
      po_count: batch.purchaseOrders.length,
      total_value: batch.totalValue.toNumber(),
      action_types: batch.actionTypes,

      // ALL POs to discuss
      purchase_orders: sortedPOs.map((po) => ({
        id: po.id,
        po_number: po.poNumber,
        po_line: po.poLine,
        description: po.description,
        action_type: po.actionType,
        due_date: po.dueDate?.toISOString(),
        recommended_date: po.recommendedDate?.toISOString(),
        quantity_balance: po.quantityBalance.toNumber(),
        total_value: po.calculatedTotalValue.toNumber(),
      })),
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { "X-API-KEY": this.apiKey }),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("HappyRobot trigger failed:", response.status, errorText);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result: HappyRobotTriggerResponse = await response.json();

      if (!result.queued_run_ids || result.queued_run_ids.length === 0) {
        return {
          success: false,
          error: "No run IDs returned from HappyRobot",
        };
      }

      const runId = result.queued_run_ids[0];

      return {
        success: true,
        runId,
        externalUrl: this.getCallUrl(runId),
      };
    } catch (error) {
      console.error("HappyRobot trigger error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get call status from HappyRobot Platform API
   */
  async getCallStatus(runId: string): Promise<CallStatusResult> {
    if (!this.platformApiKey || !this.orgId) {
      return { status: "pending" };
    }

    try {
      const response = await fetch(`https://platform.happyrobot.ai/api/v1/runs/${runId}`, {
        headers: {
          Authorization: `Bearer ${this.platformApiKey}`,
          "X-Organization-Id": this.orgId,
        },
      });

      if (!response.ok) {
        console.warn("Failed to get HappyRobot status:", response.status);
        return { status: "pending" };
      }

      const data: HappyRobotStatusResponse = await response.json();

      // Map HappyRobot status to our status
      const statusMap: Record<string, CallStatus> = {
        pending: "pending",
        running: "running",
        completed: "completed",
        failed: "failed",
        canceled: "canceled",
      };

      return {
        status: statusMap[data.status] || "pending",
        outcome: data.outcome,
        duration: data.duration_seconds,
      };
    } catch (error) {
      console.error("HappyRobot status check error:", error);
      return { status: "pending" };
    }
  }

  /**
   * Generate URL to view call in HappyRobot dashboard
   */
  getCallUrl(runId: string): string {
    if (!this.orgSlug || !this.workflowId) {
      return "";
    }
    return `https://v2.platform.happyrobot.ai/${this.orgSlug}/workflow/${this.workflowId}/runs?run_id=${runId}`;
  }
}
