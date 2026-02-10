/**
 * Call Provider Interface
 *
 * Agnostic interface for triggering AI voice calls.
 * Implementations can use HappyRobot, Bland.ai, Vapi, or any other provider.
 */

import type { Supplier, PurchaseOrder, SupplierBatch } from "@prisma/client";

/**
 * Batch data passed to the call provider
 */
export interface CallBatchData {
  batch: SupplierBatch & {
    supplier: Supplier;
    purchaseOrders: PurchaseOrder[];
  };
  callbackUrl: string;
  attemptNumber: number;
  /** Override phone number (from demo config) */
  phoneOverride?: string;
  /** Override email (from demo config) */
  emailOverride?: string;
}

/**
 * Result from triggering a call
 */
export interface CallTriggerResult {
  success: boolean;
  runId?: string; // Provider's unique run identifier
  externalUrl?: string; // URL to view the call in provider's dashboard
  error?: string;
}

/**
 * Call status from polling
 */
export type CallStatus = "pending" | "running" | "completed" | "failed" | "canceled";

/**
 * Result from checking call status
 */
export interface CallStatusResult {
  status: CallStatus;
  outcome?: string;
  summary?: string;
  duration?: number; // seconds
}

/**
 * Abstract call provider interface
 */
export interface CallProvider {
  /**
   * Provider name for logging
   */
  name: string;

  /**
   * Trigger a call for a batch
   */
  triggerCall(data: CallBatchData): Promise<CallTriggerResult>;

  /**
   * Get the status of a call by run ID (optional - for polling)
   */
  getCallStatus?(runId: string): Promise<CallStatusResult>;

  /**
   * Generate a URL to view the call in the provider's dashboard
   */
  getCallUrl?(runId: string): string;
}

/**
 * Get the configured call provider
 * Defaults to HappyRobot if HAPPYROBOT_WEBHOOK_URL is set
 */
export async function getCallProvider(): Promise<CallProvider | null> {
  // Check for HappyRobot configuration
  if (process.env.HAPPYROBOT_WEBHOOK_URL) {
    const { HappyRobotProvider } = await import("./providers/happyrobot");
    return new HappyRobotProvider();
  }

  // Add other providers here as needed
  // if (process.env.BLAND_API_KEY) { ... }
  // if (process.env.VAPI_API_KEY) { ... }

  console.warn("No call provider configured. Set HAPPYROBOT_WEBHOOK_URL or another provider.");
  return null;
}
