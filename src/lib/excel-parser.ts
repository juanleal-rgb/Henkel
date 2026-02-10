import * as XLSX from "xlsx";
import { classifyPOs, type POActionType, type ClassifiedPO } from "./classification";

// Excel column names mapped to our internal field names (for reference/documentation)
const _COLUMN_MAP: Record<string, string> = {
  "Supplier #": "supplierNumber",
  "Supplier Name": "supplierName",
  "PO #": "poNumber",
  "PO Line": "poLine",
  "PO Revision": "poRevision",
  Part: "partNumber",
  "Part Type": "partType",
  Description: "description",
  "Extra Description": "extraDescription",
  "Quantity Ordered": "quantityOrdered",
  "Quantity Received": "quantityReceived",
  "Quantity Balance": "quantityBalance",
  "Due Date": "dueDate",
  "Recommended Date": "recommendedDate",
  "PO Entry Date": "poEntryDate",
  "Expected Unit Cost": "expectedUnitCost",
  "Calculated Total Value": "calculatedTotalValue",
  "Price Source Code": "priceSourceCode",
  Facility: "facility",
  "Warehouse ID": "warehouseId",
  "Days In Transit": "daysInTransit",
  Buyer: "buyer",
  "Disposition Status": "dispositionStatus",
  "Facility Item Type": "facilityItemType",
};

// Required columns that must be present
const REQUIRED_COLUMNS = [
  "Supplier #",
  "Supplier Name",
  "PO #",
  "PO Line",
  "Part",
  "Description",
  "Quantity Ordered",
  "Quantity Received",
  "Quantity Balance",
  "Due Date",
  "Expected Unit Cost",
  "Calculated Total Value",
  "Facility",
  "Warehouse ID",
];

export interface RawPORow {
  supplierNumber: number;
  supplierName: string;
  poNumber: number;
  poLine: number;
  poRevision: number;
  partNumber: string;
  partType: string | null;
  description: string;
  extraDescription: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityBalance: number;
  dueDate: Date;
  recommendedDate: Date | null;
  poEntryDate: Date | null;
  expectedUnitCost: number;
  calculatedTotalValue: number;
  priceSourceCode: number | null;
  facility: string;
  warehouseId: string;
  daysInTransit: number | null;
  buyer: string | null;
  dispositionStatus: string | null;
  facilityItemType: string | null;
}

export interface ParseResult {
  success: boolean;
  rows: RawPORow[];
  errors: ParseError[];
  warnings: string[];
  stats: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
  };
}

export interface ParseError {
  row: number;
  column?: string;
  message: string;
  value?: unknown;
}

/**
 * Convert Excel serial date number to JavaScript Date
 * Excel dates are stored as days since 1900-01-01 (with a bug for 1900 leap year)
 */
function excelDateToJSDate(excelDate: number): Date {
  // Excel's epoch is January 1, 1900
  // But Excel incorrectly treats 1900 as a leap year, so we need to adjust
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + excelDate * millisecondsPerDay);
}

/**
 * Parse a date value from Excel (could be serial number, string, or Date)
 */
function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // If it's already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // If it's a number (Excel serial date)
  if (typeof value === "number") {
    const date = excelDateToJSDate(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // If it's a string, try to parse it
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Try ISO format first
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try MM/DD/YYYY format
    const parts = trimmed.split("/");
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

/**
 * Parse a numeric value, handling various formats
 */
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }

  if (typeof value === "string") {
    // Remove currency symbols, commas, and whitespace
    const cleaned = value.replace(/[$,\s]/g, "").trim();
    if (!cleaned) return null;

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Parse a string value
 */
function parseString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str || null;
}

/**
 * Validate that all required columns are present in the header
 */
function validateColumns(headers: string[]): { valid: boolean; missing: string[] } {
  const headerSet = new Set(headers.map((h) => h.trim()));
  const missing = REQUIRED_COLUMNS.filter((col) => !headerSet.has(col));
  return { valid: missing.length === 0, missing };
}

/**
 * Parse a single row of data into a RawPORow
 */
function parseRow(
  row: Record<string, unknown>,
  rowIndex: number
): { data: RawPORow | null; errors: ParseError[] } {
  const errors: ParseError[] = [];

  // Helper to get mapped value
  const getValue = (excelCol: string): unknown => {
    return row[excelCol];
  };

  // Parse required numeric fields
  const supplierNumber = parseNumber(getValue("Supplier #"));
  if (supplierNumber === null) {
    errors.push({
      row: rowIndex,
      column: "Supplier #",
      message: "Missing or invalid supplier number",
    });
  }

  const poNumber = parseNumber(getValue("PO #"));
  if (poNumber === null) {
    errors.push({ row: rowIndex, column: "PO #", message: "Missing or invalid PO number" });
  }

  const poLine = parseNumber(getValue("PO Line"));
  if (poLine === null) {
    errors.push({ row: rowIndex, column: "PO Line", message: "Missing or invalid PO line" });
  }

  // Parse required string fields
  const supplierName = parseString(getValue("Supplier Name"));
  if (!supplierName) {
    errors.push({ row: rowIndex, column: "Supplier Name", message: "Missing supplier name" });
  }

  const partNumber = parseString(getValue("Part"));
  if (!partNumber) {
    errors.push({ row: rowIndex, column: "Part", message: "Missing part number" });
  }

  const description = parseString(getValue("Description"));
  if (!description) {
    errors.push({ row: rowIndex, column: "Description", message: "Missing description" });
  }

  const facility = parseString(getValue("Facility"));
  if (!facility) {
    errors.push({ row: rowIndex, column: "Facility", message: "Missing facility" });
  }

  const warehouseId = parseString(getValue("Warehouse ID"));
  if (!warehouseId) {
    errors.push({ row: rowIndex, column: "Warehouse ID", message: "Missing warehouse ID" });
  }

  // Parse required date
  const dueDate = parseDate(getValue("Due Date"));
  if (!dueDate) {
    errors.push({ row: rowIndex, column: "Due Date", message: "Missing or invalid due date" });
  }

  // Parse required quantities
  const quantityOrdered = parseNumber(getValue("Quantity Ordered"));
  if (quantityOrdered === null) {
    errors.push({ row: rowIndex, column: "Quantity Ordered", message: "Missing quantity ordered" });
  }

  const quantityReceived = parseNumber(getValue("Quantity Received"));
  if (quantityReceived === null) {
    errors.push({
      row: rowIndex,
      column: "Quantity Received",
      message: "Missing quantity received",
    });
  }

  const quantityBalance = parseNumber(getValue("Quantity Balance"));
  if (quantityBalance === null) {
    errors.push({ row: rowIndex, column: "Quantity Balance", message: "Missing quantity balance" });
  }

  // Parse required financial fields
  const expectedUnitCost = parseNumber(getValue("Expected Unit Cost"));
  if (expectedUnitCost === null) {
    errors.push({
      row: rowIndex,
      column: "Expected Unit Cost",
      message: "Missing expected unit cost",
    });
  }

  const calculatedTotalValue = parseNumber(getValue("Calculated Total Value"));
  if (calculatedTotalValue === null) {
    errors.push({
      row: rowIndex,
      column: "Calculated Total Value",
      message: "Missing calculated total value",
    });
  }

  // If there are errors, return null data
  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Build the row object
  const data: RawPORow = {
    supplierNumber: supplierNumber!,
    supplierName: supplierName!,
    poNumber: poNumber!,
    poLine: poLine!,
    poRevision: parseNumber(getValue("PO Revision")) ?? 0,
    partNumber: partNumber!,
    partType: parseString(getValue("Part Type")),
    description: description!,
    extraDescription: parseString(getValue("Extra Description")),
    quantityOrdered: quantityOrdered!,
    quantityReceived: quantityReceived!,
    quantityBalance: quantityBalance!,
    dueDate: dueDate!,
    recommendedDate: parseDate(getValue("Recommended Date")),
    poEntryDate: parseDate(getValue("PO Entry Date")),
    expectedUnitCost: expectedUnitCost!,
    calculatedTotalValue: calculatedTotalValue!,
    priceSourceCode: parseNumber(getValue("Price Source Code")),
    facility: facility!,
    warehouseId: warehouseId!,
    daysInTransit: parseNumber(getValue("Days In Transit")),
    buyer: parseString(getValue("Buyer")),
    dispositionStatus: parseString(getValue("Disposition Status")),
    facilityItemType: parseString(getValue("Facility Item Type")),
  };

  return { data, errors: [] };
}

/**
 * Parse an Excel buffer into an array of PO rows
 */
export function parseExcel(buffer: Buffer): ParseResult {
  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const rows: RawPORow[] = [];

  try {
    // Read the workbook
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        success: false,
        rows: [],
        errors: [{ row: 0, message: "No sheets found in workbook" }],
        warnings: [],
        stats: { totalRows: 0, validRows: 0, skippedRows: 0 },
      };
    }

    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true, // Keep raw values (numbers as numbers)
      defval: null, // Default value for empty cells
    });

    if (jsonData.length === 0) {
      return {
        success: false,
        rows: [],
        errors: [{ row: 0, message: "No data found in sheet" }],
        warnings: [],
        stats: { totalRows: 0, validRows: 0, skippedRows: 0 },
      };
    }

    // Validate columns from first row keys
    const headers = Object.keys(jsonData[0]);
    const columnValidation = validateColumns(headers);

    if (!columnValidation.valid) {
      return {
        success: false,
        rows: [],
        errors: [
          {
            row: 0,
            message: `Missing required columns: ${columnValidation.missing.join(", ")}`,
          },
        ],
        warnings: [],
        stats: { totalRows: jsonData.length, validRows: 0, skippedRows: jsonData.length },
      };
    }

    // Parse each row
    let skippedRows = 0;
    for (let i = 0; i < jsonData.length; i++) {
      const rowData = jsonData[i];
      const rowIndex = i + 2; // +2 because Excel is 1-indexed and has header row

      const result = parseRow(rowData, rowIndex);

      if (result.data) {
        rows.push(result.data);
      } else {
        skippedRows++;
        errors.push(...result.errors);
      }
    }

    // Add warning if many rows were skipped
    if (skippedRows > 0 && skippedRows > jsonData.length * 0.1) {
      warnings.push(
        `${skippedRows} rows (${((skippedRows / jsonData.length) * 100).toFixed(1)}%) were skipped due to validation errors`
      );
    }

    return {
      success: errors.length === 0 || rows.length > 0,
      rows,
      errors,
      warnings,
      stats: {
        totalRows: jsonData.length,
        validRows: rows.length,
        skippedRows,
      },
    };
  } catch (error) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          row: 0,
          message: `Failed to parse Excel file: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      warnings: [],
      stats: { totalRows: 0, validRows: 0, skippedRows: 0 },
    };
  }
}

/**
 * Get a summary of parsed data for preview
 */
export function getParsePreview(
  rows: RawPORow[],
  limit = 10
): {
  preview: RawPORow[];
  summary: {
    totalRows: number;
    uniqueSuppliers: number;
    totalValue: number;
    dateRange: { earliest: Date; latest: Date } | null;
  };
} {
  const preview = rows.slice(0, limit);

  const supplierNumbers = new Set(rows.map((r) => r.supplierNumber));
  const totalValue = rows.reduce((sum, r) => sum + r.calculatedTotalValue, 0);

  let dateRange: { earliest: Date; latest: Date } | null = null;
  if (rows.length > 0) {
    const dueDates = rows.map((r) => r.dueDate.getTime());
    dateRange = {
      earliest: new Date(Math.min(...dueDates)),
      latest: new Date(Math.max(...dueDates)),
    };
  }

  return {
    preview,
    summary: {
      totalRows: rows.length,
      uniqueSuppliers: supplierNumbers.size,
      totalValue,
      dateRange,
    },
  };
}

/**
 * Preview row for the upload modal
 */
export interface PreviewRow {
  poNumber: number;
  poLine: number;
  supplierName: string;
  actionType: POActionType;
  calculatedTotalValue: number;
}

/**
 * Result of parsing Excel for preview in the upload modal
 */
export interface ExcelPreviewResult {
  totalRows: number;
  previewRows: PreviewRow[];
  summary: {
    total: number;
    byAction: Record<POActionType, number>;
  };
  warnings: string[];
}

/**
 * Parse Excel buffer and return preview data for the upload modal
 * This combines parsing and classification for UI display
 */
export function parseExcelPreview(buffer: Buffer, previewLimit = 10): ExcelPreviewResult {
  const parseResult = parseExcel(buffer);

  if (!parseResult.success || parseResult.rows.length === 0) {
    return {
      totalRows: 0,
      previewRows: [],
      summary: {
        total: 0,
        byAction: { CANCEL: 0, EXPEDITE: 0, PUSH_OUT: 0 },
      },
      warnings: parseResult.errors.map((e) => e.message),
    };
  }

  // Classify the POs
  const classificationResult = classifyPOs(parseResult.rows);

  // Build preview rows from classified POs
  const previewRows: PreviewRow[] = classificationResult.classified
    .slice(0, previewLimit)
    .map((po: ClassifiedPO) => ({
      poNumber: po.poNumber,
      poLine: po.poLine,
      supplierName: po.supplierName,
      actionType: po.actionType,
      calculatedTotalValue: po.calculatedTotalValue,
    }));

  return {
    totalRows: parseResult.rows.length,
    previewRows,
    summary: {
      total: classificationResult.classified.length,
      byAction: classificationResult.summary.byAction,
    },
    warnings: parseResult.warnings,
  };
}
