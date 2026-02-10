import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExcel } from "@/lib/excel-parser";
import { classifyPOs, type ClassifiedPO } from "@/lib/classification";
import { calculatePriority } from "@/lib/batching";
import { enqueueBatch } from "@/lib/queue";
import { publishPipelineEvent } from "@/lib/redis";
import {
  createUploadJob,
  updateJobProgress,
  updateJobStatus,
  type UploadJobResult,
} from "@/lib/upload-job";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large files

// Group POs by supplier
function groupBySupplier(pos: ClassifiedPO[]): Map<number, ClassifiedPO[]> {
  const groups = new Map<number, ClassifiedPO[]>();
  for (const po of pos) {
    const existing = groups.get(po.supplierNumber) || [];
    existing.push(po);
    groups.set(po.supplierNumber, existing);
  }
  return groups;
}

// Constants
const MAX_POS_PER_BATCH = 10;
const BATCH_PROCESSING_CHUNK_SIZE = 50;

// Batch definition for processing
interface BatchDefinition {
  supplierId: string;
  supplierNumber: number;
  poExternalIds: string[];
  actionTypes: string[];
  totalValue: number;
}

// Background processor
async function processUploadInBackground(
  jobId: string,
  classifiedPOs: ClassifiedPO[],
  summary: { byAction: { CANCEL: number; EXPEDITE: number; PUSH_OUT: number } },
  skippedCount: number
) {
  const result: UploadJobResult = {
    total: classifiedPOs.length,
    byAction: summary.byAction,
    suppliers: { created: 0, updated: 0 },
    batches: { created: 0, totalValue: 0 },
    conflicts: 0,
    skipped: skippedCount,
  };

  try {
    // 1. Check for existing POs
    await updateJobProgress(jobId, {
      stage: "pos",
      current: 0,
      total: 100,
      message: "Checking for existing POs...",
    });

    const allExternalIds = classifiedPOs.map((po) => `${po.poNumber}-${po.poLine}`);
    const existingPOs = await prisma.purchaseOrder.findMany({
      where: { externalId: { in: allExternalIds } },
      select: {
        id: true,
        externalId: true,
        dueDate: true,
        recommendedDate: true,
        calculatedTotalValue: true,
      },
    });
    const existingPOMap = new Map(existingPOs.map((po) => [po.externalId, po]));

    await updateJobProgress(jobId, {
      stage: "pos",
      current: 10,
      total: 100,
      message: `Found ${existingPOs.length} existing POs`,
    });

    // 2. Group POs by supplier
    const supplierGroups = groupBySupplier(classifiedPOs);
    const supplierMap = new Map<string, { id: string; number: number }>();

    // 3. Create/update suppliers and POs (Phase 1)
    await updateJobProgress(jobId, {
      stage: "pos",
      current: 15,
      total: 100,
      message: "Creating suppliers and POs...",
    });

    for (const [supplierNumber, pos] of Array.from(supplierGroups.entries())) {
      const supplierName = pos[0].supplierName;
      const facility = pos[0].facility;

      // Upsert supplier
      const supplier = await prisma.supplier.upsert({
        where: { supplierNumber: String(supplierNumber) },
        update: { name: supplierName, facility },
        create: {
          supplierNumber: String(supplierNumber),
          name: supplierName,
          phone: "",
          facility,
        },
      });

      supplierMap.set(String(supplierNumber), { id: supplier.id, number: supplierNumber });

      if (supplier.createdAt.getTime() > Date.now() - 5000) {
        result.suppliers.created++;
      } else {
        result.suppliers.updated++;
      }

      // Separate new vs existing POs
      const newPOs: ClassifiedPO[] = [];
      const updatePOs: Array<{ id: string; po: ClassifiedPO }> = [];

      for (const po of pos) {
        const externalId = `${po.poNumber}-${po.poLine}`;
        const existing = existingPOMap.get(externalId);

        if (existing) {
          updatePOs.push({ id: existing.id, po });

          const hasDiff =
            existing.dueDate.getTime() !== po.dueDate.getTime() ||
            existing.recommendedDate?.getTime() !== po.recommendedDate?.getTime() ||
            Number(existing.calculatedTotalValue) !== po.calculatedTotalValue;

          if (hasDiff) {
            result.conflicts++;
          }
        } else {
          newPOs.push(po);
        }
      }

      // Create new POs (without batchId - will be assigned later)
      if (newPOs.length > 0) {
        await prisma.purchaseOrder.createMany({
          data: newPOs.map((po) => ({
            externalId: `${po.poNumber}-${po.poLine}`,
            supplierId: supplier.id,
            actionType: po.actionType,
            status: "QUEUED",
            poNumber: String(po.poNumber),
            poLine: po.poLine,
            partNumber: po.partNumber,
            partType: po.partType,
            description: po.description,
            extraDescription: po.extraDescription,
            quantityOrdered: po.quantityOrdered,
            quantityReceived: po.quantityReceived,
            quantityBalance: po.quantityBalance,
            dueDate: po.dueDate,
            recommendedDate: po.recommendedDate,
            poEntryDate: po.poEntryDate,
            expectedUnitCost: po.expectedUnitCost,
            calculatedTotalValue: po.calculatedTotalValue,
            priceSourceCode: po.priceSourceCode,
            facility: po.facility,
            warehouseId: po.warehouseId,
            daysInTransit: po.daysInTransit,
            buyer: po.buyer,
            dispositionStatus: po.dispositionStatus,
            facilityItemType: po.facilityItemType,
            poRevision: po.poRevision,
          })),
          skipDuplicates: true,
        });
      }

      // Update existing POs (clear batchId for re-batching)
      if (updatePOs.length > 0) {
        await Promise.all(
          updatePOs.map(({ id, po }) =>
            prisma.purchaseOrder.update({
              where: { id },
              data: {
                actionType: po.actionType,
                status: "QUEUED",
                dueDate: po.dueDate,
                recommendedDate: po.recommendedDate,
                quantityOrdered: po.quantityOrdered,
                quantityReceived: po.quantityReceived,
                quantityBalance: po.quantityBalance,
                expectedUnitCost: po.expectedUnitCost,
                calculatedTotalValue: po.calculatedTotalValue,
                partType: po.partType,
                extraDescription: po.extraDescription,
                priceSourceCode: po.priceSourceCode,
                warehouseId: po.warehouseId,
                daysInTransit: po.daysInTransit,
                buyer: po.buyer,
                dispositionStatus: po.dispositionStatus,
                facilityItemType: po.facilityItemType,
                poRevision: po.poRevision,
                poEntryDate: po.poEntryDate,
                batchId: null,
              },
            })
          )
        );
      }
    }

    await updateJobProgress(jobId, {
      stage: "pos",
      current: 30,
      total: 100,
      message: "POs created. Preparing batches...",
    });

    // 4. Build batch definitions (max 10 POs per batch)
    const batchDefinitions: BatchDefinition[] = [];

    for (const [supplierNumber, pos] of Array.from(supplierGroups.entries())) {
      const supplierData = supplierMap.get(String(supplierNumber));
      if (!supplierData) continue;

      // Sort POs by value DESC within supplier
      const sortedPOs = [...pos].sort((a, b) => b.calculatedTotalValue - a.calculatedTotalValue);

      // Split into batches of MAX_POS_PER_BATCH
      for (let i = 0; i < sortedPOs.length; i += MAX_POS_PER_BATCH) {
        const batchPOs = sortedPOs.slice(i, i + MAX_POS_PER_BATCH);
        const poExternalIds = batchPOs.map((po) => `${po.poNumber}-${po.poLine}`);
        const actionTypes = Array.from(new Set(batchPOs.map((p) => p.actionType)));
        const totalValue = batchPOs.reduce((sum, po) => sum + po.calculatedTotalValue, 0);

        batchDefinitions.push({
          supplierId: supplierData.id,
          supplierNumber,
          poExternalIds,
          actionTypes,
          totalValue,
        });
      }
    }

    // Sort batches by value DESC (highest value batches first)
    batchDefinitions.sort((a, b) => b.totalValue - a.totalValue);

    const totalBatches = batchDefinitions.length;

    await updateJobProgress(jobId, {
      stage: "batches",
      current: 0,
      total: 100,
      message: `Creating ${totalBatches} batches...`,
    });

    // 5. Process batches in chunks of 50
    const processBatch = async (batchDef: BatchDefinition) => {
      const { supplierId, poExternalIds, actionTypes, totalValue } = batchDef;

      // Verify POs exist and are unassigned
      const actualPOCount = await prisma.purchaseOrder.count({
        where: { externalId: { in: poExternalIds }, batchId: null },
      });

      if (actualPOCount === 0) {
        return { created: false, value: 0 };
      }

      const priority = calculatePriority(totalValue);

      // Create batch
      const batchRecord = await prisma.supplierBatch.create({
        data: {
          supplierId,
          status: "QUEUED",
          actionTypes,
          totalValue,
          poCount: actualPOCount,
          priority: Math.abs(priority),
        },
      });

      // Link POs to batch
      await prisma.purchaseOrder.updateMany({
        where: { externalId: { in: poExternalIds }, batchId: null },
        data: { batchId: batchRecord.id },
      });

      // Enqueue and publish SSE
      await enqueueBatch(batchRecord.id, priority);
      await publishPipelineEvent({
        type: "batch_queued",
        batchId: batchRecord.id,
        supplierId,
        value: totalValue,
        poCount: actualPOCount,
        actionTypes,
      });

      return { created: true, value: totalValue };
    };

    // Process in chunks of 50 batches
    for (
      let chunkStart = 0;
      chunkStart < batchDefinitions.length;
      chunkStart += BATCH_PROCESSING_CHUNK_SIZE
    ) {
      const chunk = batchDefinitions.slice(chunkStart, chunkStart + BATCH_PROCESSING_CHUNK_SIZE);
      const chunkEnd = Math.min(chunkStart + chunk.length, batchDefinitions.length);

      // Update progress
      const progressPercent = Math.round((chunkStart / totalBatches) * 100);
      await updateJobProgress(jobId, {
        stage: "batches",
        current: progressPercent,
        total: 100,
        message: `Creating batches ${chunkStart + 1}-${chunkEnd} of ${totalBatches}...`,
      });

      // Process chunk in parallel
      const chunkResults = await Promise.all(chunk.map(processBatch));

      // Aggregate results
      for (const batchResult of chunkResults) {
        if (batchResult.created) {
          result.batches.created++;
          result.batches.totalValue += batchResult.value;
        }
      }
    }

    // Mark complete
    await updateJobStatus(jobId, "complete", result);
  } catch (error) {
    console.error("Background upload processing error:", error);
    await updateJobStatus(
      jobId,
      "error",
      undefined,
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, error: "Invalid file type. Please upload an Excel file (.xlsx or .xls)" },
        { status: 400 }
      );
    }

    // Parse and classify (fast operations, do synchronously)
    const buffer = Buffer.from(await file.arrayBuffer());
    const parseResult = parseExcel(buffer);

    if (!parseResult.success || parseResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to parse Excel file",
          details: parseResult.errors.slice(0, 10),
        },
        { status: 400 }
      );
    }

    const classificationResult = classifyPOs(parseResult.rows);

    if (classificationResult.classified.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          total: parseResult.rows.length,
          byAction: { CANCEL: 0, EXPEDITE: 0, PUSH_OUT: 0 },
          suppliers: { created: 0, updated: 0 },
          batches: { created: 0, totalValue: 0 },
          conflicts: 0,
          skipped: classificationResult.skipped.length,
        },
        message: "No actionable POs found",
      });
    }

    // Create job and return immediately
    const jobId = await createUploadJob();

    await updateJobProgress(jobId, {
      stage: "parsing",
      current: 100,
      total: 100,
      message: `Parsed ${classificationResult.classified.length} POs`,
    });

    // Start background processing (don't await)
    processUploadInBackground(
      jobId,
      classificationResult.classified,
      classificationResult.summary,
      classificationResult.skipped.length
    );

    // Return job ID immediately so frontend can track progress
    return NextResponse.json({
      success: true,
      jobId,
      preview: {
        total: classificationResult.classified.length,
        byAction: classificationResult.summary.byAction,
        skipped: classificationResult.skipped.length,
      },
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
}
