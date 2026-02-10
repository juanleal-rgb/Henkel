import type { RawPORow } from "./excel-parser";

/**
 * PO Action Types
 * - CANCEL: Recommended Date is NULL (no rescheduling, just cancel)
 * - EXPEDITE: Recommended Date < Due Date (need it sooner)
 * - PUSH_OUT: Recommended Date > Due Date (can wait longer)
 */
export type POActionType = "CANCEL" | "EXPEDITE" | "PUSH_OUT";

export interface ClassifiedPO extends RawPORow {
  actionType: POActionType;
  daysDifference: number | null; // Days between due date and recommended date
}

export interface ClassificationResult {
  classified: ClassifiedPO[];
  skipped: RawPORow[]; // Rows where recommendedDate === dueDate (no action needed)
  summary: {
    total: number;
    byAction: Record<POActionType, number>;
    skipped: number;
    averageDaysDifference: {
      expedite: number | null;
      pushOut: number | null;
    };
  };
}

/**
 * Calculate the difference in days between two dates
 * Positive = recommended is later than due (push out)
 * Negative = recommended is earlier than due (expedite)
 */
function daysDifference(dueDate: Date, recommendedDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const recommendedDateOnly = new Date(
    recommendedDate.getFullYear(),
    recommendedDate.getMonth(),
    recommendedDate.getDate()
  );
  return Math.round((recommendedDateOnly.getTime() - dueDateOnly.getTime()) / msPerDay);
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Classify a single PO row into an action type
 *
 * Classification logic:
 * - NULL Recommended Date -> CANCEL
 * - Recommended Date < Due Date -> EXPEDITE
 * - Recommended Date > Due Date -> PUSH_OUT
 * - Recommended Date = Due Date -> Skip (no action needed)
 */
export function classifyPO(row: RawPORow): { actionType: POActionType; daysDiff: number } | null {
  // If no recommended date, it's a cancellation
  if (!row.recommendedDate) {
    return { actionType: "CANCEL", daysDiff: 0 };
  }

  // If recommended date equals due date, skip (no action needed)
  if (isSameDay(row.dueDate, row.recommendedDate)) {
    return null;
  }

  const daysDiff = daysDifference(row.dueDate, row.recommendedDate);

  if (daysDiff < 0) {
    // Recommended date is earlier than due date -> EXPEDITE
    return { actionType: "EXPEDITE", daysDiff };
  } else {
    // Recommended date is later than due date -> PUSH_OUT
    return { actionType: "PUSH_OUT", daysDiff };
  }
}

/**
 * Classify an array of PO rows
 */
export function classifyPOs(rows: RawPORow[]): ClassificationResult {
  const classified: ClassifiedPO[] = [];
  const skipped: RawPORow[] = [];

  const expediteDays: number[] = [];
  const pushOutDays: number[] = [];

  for (const row of rows) {
    const result = classifyPO(row);

    if (result === null) {
      // Skip this row - no action needed
      skipped.push(row);
    } else {
      classified.push({
        ...row,
        actionType: result.actionType,
        daysDifference: result.daysDiff,
      });

      // Track days for average calculation
      if (result.actionType === "EXPEDITE") {
        expediteDays.push(Math.abs(result.daysDiff));
      } else if (result.actionType === "PUSH_OUT") {
        pushOutDays.push(result.daysDiff);
      }
    }
  }

  // Count by action type
  const byAction: Record<POActionType, number> = {
    CANCEL: 0,
    EXPEDITE: 0,
    PUSH_OUT: 0,
  };

  for (const po of classified) {
    byAction[po.actionType]++;
  }

  // Calculate averages
  const avgExpedite =
    expediteDays.length > 0
      ? Math.round(expediteDays.reduce((a, b) => a + b, 0) / expediteDays.length)
      : null;

  const avgPushOut =
    pushOutDays.length > 0
      ? Math.round(pushOutDays.reduce((a, b) => a + b, 0) / pushOutDays.length)
      : null;

  return {
    classified,
    skipped,
    summary: {
      total: rows.length,
      byAction,
      skipped: skipped.length,
      averageDaysDifference: {
        expedite: avgExpedite,
        pushOut: avgPushOut,
      },
    },
  };
}

/**
 * Format action type for display
 */
export function formatActionType(actionType: POActionType): string {
  switch (actionType) {
    case "CANCEL":
      return "Cancel";
    case "EXPEDITE":
      return "Expedite";
    case "PUSH_OUT":
      return "Push Out";
  }
}

/**
 * Get color class for action type (for UI)
 * Uses monochrome styling with opacity-based differentiation
 */
export function getActionTypeColor(actionType: POActionType): {
  bg: string;
  text: string;
  border: string;
} {
  switch (actionType) {
    case "CANCEL":
      // Dashed border for destructive actions
      return {
        bg: "bg-white/4",
        text: "text-white/70",
        border: "border-dashed border-white/20",
      };
    case "EXPEDITE":
      // Higher opacity for urgent actions
      return {
        bg: "bg-white/8",
        text: "text-white/80",
        border: "border-white/15",
      };
    case "PUSH_OUT":
      // Standard opacity
      return {
        bg: "bg-white/6",
        text: "text-white/70",
        border: "border-white/12",
      };
  }
}

/**
 * Get icon name for action type (using Lucide icons)
 */
export function getActionTypeIcon(actionType: POActionType): string {
  switch (actionType) {
    case "CANCEL":
      return "XCircle";
    case "EXPEDITE":
      return "FastForward";
    case "PUSH_OUT":
      return "Clock";
  }
}
