import { z } from "zod";

// ============================================================================
// Henkel PO Caller Enums (mirrors Prisma schema)
// ============================================================================

export const POActionTypeSchema = z.enum(["CANCEL", "EXPEDITE", "PUSH_OUT"]);

export const POStatusSchema = z.enum([
  "PENDING",
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CONFLICT",
]);

export const BatchStatusSchema = z.enum([
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "PARTIAL",
]);

export const PORunStatusSchema = z.enum([
  "PENDING",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "CALLBACK_SCHEDULED",
]);

// Types from enums
export type POActionType = z.infer<typeof POActionTypeSchema>;
export type POStatus = z.infer<typeof POStatusSchema>;
export type BatchStatus = z.infer<typeof BatchStatusSchema>;
export type PORunStatus = z.infer<typeof PORunStatusSchema>;

// ============================================================================
// HappyRobot Webhook Payloads (adapted for PO context)
// ============================================================================

export const happyRobotCallStartedSchema = z.object({
  event: z.literal("call.started"),
  callId: z.string(),
  batchId: z.string().optional(),
  phone: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const happyRobotLogsSchema = z.object({
  event: z.literal("logs"),
  callId: z.string(),
  logs: z.array(
    z.object({
      timestamp: z.string(),
      speaker: z.enum(["agent", "supplier", "system"]),
      text: z.string(),
      type: z.enum(["speech", "action", "info"]).optional(),
    })
  ),
});

export const happyRobotCallEndedSchema = z.object({
  event: z.literal("call.ended"),
  callId: z.string(),
  batchId: z.string().optional(),
  duration: z.number(),
  outcome: z.string().optional(), // connected, no_answer, voicemail, callback_requested, etc.
  transcript: z
    .array(
      z.object({
        speaker: z.enum(["agent", "supplier"]),
        text: z.string(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
  summary: z.string().optional(),
  // PO-specific results from the call
  poResults: z
    .array(
      z.object({
        poNumber: z.string(),
        poLine: z.number(),
        acknowledged: z.boolean(),
        supplierComments: z.string().optional(),
      })
    )
    .optional(),
  // Callback scheduling
  callbackTime: z.string().datetime().optional(),
  callbackReason: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const happyRobotWebhookSchema = z.discriminatedUnion("event", [
  happyRobotCallStartedSchema,
  happyRobotLogsSchema,
  happyRobotCallEndedSchema,
]);

// Inferred types from schemas
export type HappyRobotWebhook = z.infer<typeof happyRobotWebhookSchema>;
export type HappyRobotCallStarted = z.infer<typeof happyRobotCallStartedSchema>;
export type HappyRobotLogs = z.infer<typeof happyRobotLogsSchema>;
export type HappyRobotCallEnded = z.infer<typeof happyRobotCallEndedSchema>;

// ============================================================================
// Upload API Validators
// ============================================================================

// Single PO row for upload
export const uploadPORowSchema = z.object({
  supplierNumber: z.string().min(1),
  supplierName: z.string().min(1),
  supplierPhone: z.string().min(1),
  facility: z.string().optional(),
  poNumber: z.string().min(1),
  poLine: z.number().int().positive(),
  itemNumber: z.string().optional(),
  itemDescription: z.string().optional(),
  dueDate: z.string().or(z.date()),
  recommendedDate: z.string().or(z.date()).optional(),
  orderQty: z.number().optional(),
  openQty: z.number().optional(),
  unitPrice: z.number().optional(),
  buyer: z.string().optional(),
});

// Upload cancellations request
export const uploadCancellationsSchema = z.object({
  pos: z.array(uploadPORowSchema).min(1),
  source: z.string().optional(), // e.g., "manual", "excel_import", "api"
});

// Upload reschedules request
export const uploadReschedulesSchema = z.object({
  pos: z.array(uploadPORowSchema).min(1),
  source: z.string().optional(),
});

export type UploadPORow = z.infer<typeof uploadPORowSchema>;
export type UploadCancellations = z.infer<typeof uploadCancellationsSchema>;
export type UploadReschedules = z.infer<typeof uploadReschedulesSchema>;

// ============================================================================
// Query Filters
// ============================================================================

export const poFiltersSchema = z.object({
  status: POStatusSchema.optional(),
  actionType: POActionTypeSchema.optional(),
  supplierId: z.string().optional(),
  batchId: z.string().optional(),
  search: z.string().optional(), // Search by PO number, supplier name
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().min(1).max(500).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export const batchFiltersSchema = z.object({
  status: BatchStatusSchema.optional(),
  supplierId: z.string().optional(),
  hasConflicts: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

export const supplierFiltersSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export type POFilters = z.infer<typeof poFiltersSchema>;
export type BatchFilters = z.infer<typeof batchFiltersSchema>;
export type SupplierFilters = z.infer<typeof supplierFiltersSchema>;

// ============================================================================
// Conflict Resolution
// ============================================================================

export const resolveConflictSchema = z.object({
  resolution: z.enum(["keep_existing", "use_new", "merge"]),
  notes: z.string().optional(),
});

export type ResolveConflict = z.infer<typeof resolveConflictSchema>;

// ============================================================================
// Excel Parser Validators
// ============================================================================

/**
 * Schema for a raw PO row parsed from Excel
 * This validates the data after parsing from the Excel file
 */
export const rawPORowSchema = z.object({
  supplierNumber: z.number().int().positive(),
  supplierName: z.string().min(1),
  poNumber: z.number().int().positive(),
  poLine: z.number().int().positive(),
  poRevision: z.number().int().min(0),
  partNumber: z.string().min(1),
  partType: z.string().nullable(),
  description: z.string().min(1),
  extraDescription: z.string().nullable(),
  quantityOrdered: z.number().min(0),
  quantityReceived: z.number().min(0),
  quantityBalance: z.number(),
  dueDate: z.date(),
  recommendedDate: z.date().nullable(),
  poEntryDate: z.date().nullable(),
  expectedUnitCost: z.number().min(0),
  calculatedTotalValue: z.number().min(0),
  priceSourceCode: z.number().int().nullable(),
  facility: z.string().min(1),
  warehouseId: z.string().min(1),
  daysInTransit: z.number().int().nullable(),
  buyer: z.string().nullable(),
  dispositionStatus: z.string().nullable(),
  facilityItemType: z.string().nullable(),
});

export type RawPORowValidated = z.infer<typeof rawPORowSchema>;

/**
 * Schema for a classified PO (after applying action type logic)
 */
export const classifiedPOSchema = rawPORowSchema.extend({
  actionType: POActionTypeSchema,
  daysDifference: z.number().nullable(),
});

export type ClassifiedPOValidated = z.infer<typeof classifiedPOSchema>;

/**
 * Schema for Excel upload response
 */
export const excelUploadResponseSchema = z.object({
  success: z.boolean(),
  summary: z.object({
    total: z.number(),
    byAction: z.object({
      CANCEL: z.number(),
      EXPEDITE: z.number(),
      PUSH_OUT: z.number(),
    }),
    suppliers: z.object({
      created: z.number(),
      updated: z.number(),
    }),
    batches: z.object({
      created: z.number(),
      totalValue: z.number(),
    }),
    conflicts: z.number(),
    skipped: z.number(),
  }),
  errors: z
    .array(
      z.object({
        row: z.number(),
        column: z.string().optional(),
        message: z.string(),
      })
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
});

export type ExcelUploadResponse = z.infer<typeof excelUploadResponseSchema>;

/**
 * Schema for Excel preview (before actual upload)
 */
export const excelPreviewSchema = z.object({
  valid: z.boolean(),
  stats: z.object({
    totalRows: z.number(),
    validRows: z.number(),
    skippedRows: z.number(),
  }),
  classification: z.object({
    total: z.number(),
    byAction: z.object({
      CANCEL: z.number(),
      EXPEDITE: z.number(),
      PUSH_OUT: z.number(),
    }),
    skipped: z.number(),
  }),
  preview: z.array(classifiedPOSchema).max(10),
  uniqueSuppliers: z.number(),
  totalValue: z.number(),
  errors: z
    .array(
      z.object({
        row: z.number(),
        column: z.string().optional(),
        message: z.string(),
      })
    )
    .optional(),
});

export type ExcelPreview = z.infer<typeof excelPreviewSchema>;
