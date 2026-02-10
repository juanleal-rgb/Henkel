# Henkel PO Caller - Implementation Plan

## Overview

Build the Henkel PO Caller system incrementally, starting with a deployable skeleton on Railway and adding features progressively. Based on the existing `unir-demo` project patterns.

---

## Phase 0: Project Setup & Initial Deployment [COMPLETE]

**Goal**: Get a minimal app running on Railway with database connection.

### 0.1 Clone & Adapt Base Project

- [x] Copy entire `unir-demo` folder contents to `Henkel`
- [x] Update `package.json` (name: "henkel-po-caller")
- [x] Clean up unneeded UNIR-specific code (leads, prospects, programs)
- [x] Keep: Auth, Redis, Prisma setup, HappyRobot client, SSE, UI components

### 0.2 Minimal Prisma Schema

- [x] Create new schema with just `Supplier` and `PurchaseOrder` models
- [x] Keep `User` model for auth
- [x] Run `prisma generate` and `prisma db push` (locally)

### 0.3 Railway Infrastructure

- [x] Create Railway project with 3 services (PostgreSQL, Redis, App)
- [x] Push to GitHub repository
- [x] Configure environment variables on Railway
- [x] Deploy skeleton app with health check

### 0.4 Verification

- [x] App loads on Railway URL (https://henkel-po-caller-production.up.railway.app)
- [x] `/api/health` returns OK
- [x] Database connection works (schema pushed via `prisma db push`)
- [x] Redis connection works

**Files**: `package.json`, `prisma/schema.prisma`, `src/app/api/health/route.ts`, `railway.toml`

---

## Phase 1: Data Model [COMPLETE]

**Goal**: Complete Prisma schema with all models needed for the system.

### 1.1 Implementation

- [x] Add enums: `POActionType` (CANCEL, EXPEDITE, PUSH_OUT), `POStatus`, `BatchStatus`, `PORunStatus`
- [x] Add models: `Supplier`, `PurchaseOrder`, `SupplierBatch`, `POAgentRun`, `POConflict`, `POActivityLog`, `POSystemConfig`
- [x] Add indexes for: supplier lookups, PO queries by status, batch ordering
- [x] Run migrations on Railway (via `prisma db push --url`)

### 1.2 Verification

- [x] `prisma generate` succeeds
- [x] Schema compiles with no errors
- [x] Can connect to Railway DB and see tables

**Files**: `prisma/schema.prisma`

---

## Phase 2: Excel Parser [COMPLETE]

**Goal**: Parse Henkel Excel files into typed data structures.

### Excel Format Reference

Both Henkel files use identical 24-column format (see `docs/PO_DATA_FORMAT.md` for full spec):

```
Supplier #, Supplier Name           -> Supplier entity
PO #, PO Line                       -> Unique PO line identifier
Due Date                            -> Current due date
Recommended Date                    -> New proposed date (null = cancel)
Calculated Total Value              -> For priority calculation
Quantity Balance                    -> Outstanding quantity
Buyer, Facility, Part, Part Type    -> Additional context
Description, Extra Description      -> Part details
Quantity Ordered, Quantity Received -> Fulfillment tracking
Price Source Code, Expected Unit Cost, Facility Item Type
Days In Transit, Warehouse ID, PO Entry Date, PO Revision, Disposition Status
```

### Auto-classification Logic

```
Recommended Date is NULL         -> CANCEL
Recommended Date < Due Date      -> EXPEDITE (move earlier)
Recommended Date > Due Date      -> PUSH_OUT (move later)
Recommended Date = Due Date      -> No action needed (skip)
```

### 2.1 Implementation

- [x] Install `xlsx` package for Excel parsing
- [x] Create `/lib/excel-parser.ts`:
  - `parseExcel(buffer: Buffer)` -> Returns typed array of PO rows
  - Validate required columns exist
  - Handle date parsing (Excel serial dates)
  - Map column names to camelCase fields
- [x] Create `/lib/classification.ts`:
  - `classifyPO(row)` -> Returns `CANCEL | EXPEDITE | PUSH_OUT | null`
  - Compare dates to determine action type
- [x] Create Zod schemas in `/lib/validators.ts` (added to existing file)

### 2.2 Verification

- [x] Unit test: Parse Cancel Messages xlsx -> 521 rows, all CANCEL
- [x] Unit test: Parse Full POs xlsx -> 8979 rows, mix of types (2831 CANCEL, 1465 EXPEDITE, 4683 PUSH_OUT)
- [x] Test date parsing handles various formats

**Files**: `src/lib/excel-parser.ts`, `src/lib/classification.ts`, `src/lib/validators.ts`, `scripts/test-parser.ts`

---

## Phase 3: Upload API + Batching + Queue [COMPLETE]

**Goal**: API endpoint that accepts Excel file, stores data in DB, creates batches, and enqueues for processing.

### Upload Flow

```
Excel Upload -> Parse -> Classify -> Store POs -> Group by Supplier -> Create Batches -> Enqueue to Redis
```

### 3.1 Batching Logic

- [x] Create `/lib/batching.ts`:
  - `createSupplierBatches(pos: PurchaseOrder[])` - Group POs by supplier
  - `calculatePriority(batch)` - Based on total value (higher = first)
  - Respect `maxPOsPerBatch` config limit
  - Handle mixed action types in same batch

### 3.2 Queue Operations

- [x] Create `/lib/queue.ts`:
  - `enqueueBatch(batchId, priority)` - Add to Redis sorted set (`po:queue:primary`)
  - `dequeueBatch()` - Pop highest priority batch
  - `scheduleCallback(batchId, scheduledFor)` - Add to callback queue (`po:queue:callbacks`)
  - `getQueueStats()` - Count pending/processing batches

**Redis Queue Structure**:

| Queue                | Type       | Score         | Purpose                           |
| -------------------- | ---------- | ------------- | --------------------------------- |
| `po:queue:primary`   | Sorted Set | `-totalValue` | Higher value batches called first |
| `po:queue:callbacks` | Sorted Set | `timestamp`   | Scheduled retries                 |

### 3.3 Upload API

- [x] Create `POST /api/upload/pos`:
  - Accept multipart form data (xlsx file)
  - Use excel-parser to parse file
  - Use classification to determine action types
  - Upsert Suppliers (by `Supplier #`)
  - Create PurchaseOrders with `actionType` and status `PENDING`
  - Detect conflicts (duplicate PO# + Line with different data)
  - Create POConflict records for duplicates
  - **Group POs by supplier -> Create SupplierBatch records**
  - **Enqueue batches to Redis (priority by total value)**
  - **Update PO/Batch status to QUEUED**
  - Return summary JSON

### 3.4 Response Format

```typescript
{
  success: true,
  summary: {
    total: 521,
    byAction: { CANCEL: 521, EXPEDITE: 0, PUSH_OUT: 0 },
    suppliers: { created: 12, updated: 69 },
    batches: { created: 81, totalValue: 7340080.38 },
    conflicts: 3,
    skipped: 0  // Recommended Date = Due Date
  }
}
```

### 3.5 Verification

- [x] Upload Cancel Messages via curl/Postman (521 POs, 81 suppliers, 83 batches)
- [x] Check DB has correct Supplier, PO, and Batch records
- [x] Verify action types are correct (521 CANCEL)
- [x] Check Redis has batches in sorted set with correct priority (83 batches)
- [x] Verify higher value batches have higher priority ($1.15M first)
- [x] Upload same file again -> conflicts created (34 conflicts)

**Note**: Large files (8,979+ rows) may timeout. Consider chunked uploads for production.

**Files**: `src/lib/batching.ts`, `src/lib/queue.ts`, `src/app/api/upload/pos/route.ts`, `scripts/test-upload.ts`

---

## Phase 4: Upload UI [COMPLETE]

**Goal**: Frontend component for Excel file upload with async processing.

### 4.1 Implementation

- [x] Create `UploadFAB.tsx` - Floating action button (bottom-right)
  - Badge showing active upload count
  - Pulsating animation when uploads in progress
- [x] Create `UploadModal.tsx`:
  - Drag & drop zone for .xlsx files
  - File validation (xlsx only, size limit 50MB)
  - Parse preview (first 5 rows in table)
  - Summary stats before confirm (PO counts by action type)
  - Real-time progress via SSE with stage indicators
  - Active uploads list (can close modal and reopen to check progress)
  - Success toast with counts + batches created
  - Error handling with clear messages
- [x] Add FAB to Dashboard page
- [x] Add `parseExcelPreview()` function for client-side preview
- [x] Create `/lib/upload-job.ts` for async job tracking in Redis
- [x] Create `/api/upload/progress/[jobId]` SSE endpoint for real-time updates

### 4.2 Async Upload Flow

```
Client uploads file -> Server starts async job -> Returns jobId
Client subscribes to SSE /api/upload/progress/[jobId]
Server sends progress events: parsing, processing, batching, complete
Client shows real-time progress UI
```

### 4.3 Verification

- [x] FAB appears on dashboard with badge for active uploads
- [x] Drag & drop works
- [x] Preview shows correct data with classification
- [x] Upload shows real-time progress via SSE
- [x] Can close modal, FAB shows badge, reopen to see progress
- [x] Upload succeeds and shows summary (521 POs, 83 batches, $7.34M)
- [x] Invalid file shows error

**Files**: `src/components/upload/UploadFAB.tsx`, `src/components/upload/UploadModal.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/lib/excel-parser.ts`, `src/lib/upload-job.ts`, `src/app/api/upload/progress/[jobId]/route.ts`, `src/stores/ui-store.ts`

---

## Phase 5: Query APIs [COMPLETE]

**Goal**: Read APIs for dashboard and supplier data.

### 5.1 Batch Stats API [DONE]

- [x] `GET /api/batches/stats`:
  - **Stages**: Count and total value by BatchStatus (QUEUED, IN_PROGRESS, COMPLETED, FAILED, PARTIAL)
  - **Totals**: Total batches, total value, total POs, unique suppliers
  - **Action Types**: Count and value by POActionType (CANCEL, EXPEDITE, PUSH_OUT)
  - Response format matches `StatsResponse` type in `kpi-utils.ts`

```typescript
{
  data: {
    stages: {
      QUEUED: { count: 8, totalValue: 125000 },
      IN_PROGRESS: { count: 2, totalValue: 45000 },
      // ...
    },
    totals: {
      batches: 182,
      totalValue: 1115000,
      totalPOs: 1847,
      uniqueSuppliers: 45
    },
    actionTypes: {
      CANCEL: { count: 521, totalValue: 280000 },
      // ...
    }
  }
}
```

### 5.2 Supplier APIs [DONE]

- [x] `GET /api/suppliers`:
  - List all suppliers with aggregated stats
  - Include: batch stats, PO stats by status/action type, total value
  - Support search, pagination, sorting
- [x] `GET /api/suppliers/[id]`:
  - Supplier details with batches and optional PO list
  - Include stats by status and action type
  - Paginated PO list with status filtering

### 5.3 Batch APIs [DONE]

- [x] `GET /api/batches`:
  - List batches filtered by status
  - Used by pipeline table to load batches for selected stage
  - Pagination support
- [x] `GET /api/batches/[id]`:
  - Batch details with supplier info and all POs
  - Agent run history (last 5)

### 5.4 Verification

- [x] After upload, `/api/batches/stats` returns correct counts
- [x] Dashboard shows real data from API
- [x] `/api/suppliers` returns supplier list with stats (178 suppliers)
- [x] Supplier detail shows batches and stats correctly
- [x] `/api/batches?status=QUEUED` returns batches for pipeline table (390 batches)
- [x] Batch detail returns POs and supplier info

**Files**: `src/app/api/batches/stats/route.ts`, `src/app/api/batches/route.ts`, `src/app/api/batches/[id]/route.ts`, `src/app/api/suppliers/route.ts`, `src/app/api/suppliers/[id]/route.ts`

---

## Phase 6: HappyRobot Integration + Real-Time Updates

**Goal**: Trigger calls via HappyRobot, receive real-time logs, animate pipeline state changes.

### 6.0 Upload Flow Redesign

The upload process creates batches directly as QUEUED with real-time SSE updates.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UPLOAD FLOW                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Click "Upload 8,979 POs"                                               │
│         │                                                               │
│         ▼                                                               │
│  [Phase 1: Bulk Insert]                                                 │
│  • Create/upsert Suppliers                                              │
│  • Create POs (status: QUEUED, linked to batches)                       │
│  • Create Batches (status: QUEUED) + enqueue to Redis                   │
│  • Publish SSE events as batches are created                            │
│         │                                                               │
│         ▼                                                               │
│  [Frontend - Pipeline]                                                  │
│  • Receives SSE events via /api/pipeline/events                         │
│  • QUEUED count increases in real-time                                  │
│  • Sankey shows incoming batches                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 6.0.1 Pipeline SSE Endpoint

**File**: `src/app/api/pipeline/events/route.ts`

```typescript
// GET /api/pipeline/events
// SSE stream for all pipeline state changes

// Event types:
type PipelineEvent =
  | { type: "batch_queued"; batchId: string; supplierId: string; value: number; poCount: number }
  | { type: "batch_started"; batchId: string; externalUrl?: string }
  | { type: "batch_completed"; batchId: string; outcome: "SUCCESS" | "PARTIAL" | "FAILED" }
  | { type: "stats_update"; stats: PipelineStats }; // Periodic full stats refresh
```

**Redis Channel**: `pipeline:events`

#### 6.0.2 Upload API Changes

**File**: `src/app/api/upload/pos/route.ts`

```typescript
// Create batch directly as QUEUED and enqueue to Redis
const batchRecord = await prisma.supplierBatch.create({
  data: {
    supplierId,
    status: "QUEUED", // Batches start as QUEUED (no PENDING state)
    actionTypes,
    totalValue,
    poCount,
    priority,
  },
});

// Enqueue and publish SSE
await enqueueBatch(batchRecord.id, priority);
await publishPipelineEvent({
  type: "batch_queued",
  batchId: batchRecord.id,
  supplierId,
  value: totalValue,
  poCount,
  actionTypes,
});
```

#### 6.0.3 Pipeline Component SSE Subscription

**File**: `src/components/pipeline/batches-pipeline.tsx`

Uses `usePipelineEvents` hook for debounced refresh on SSE events:

```typescript
// Subscribe to pipeline events with debounced refresh
const { stats, isConnected } = usePipelineEvents({
  onBatchQueued: () => debouncedRefresh(),
  onBatchStarted: () => debouncedRefresh(),
  onBatchCompleted: () => debouncedRefresh(),
});

// Events trigger stats refresh, UI updates automatically
// SankeyNode has pulse animation when counts change
```

#### 6.0.4 Upload FAB Icon Change

**File**: `src/components/upload/UploadFAB.tsx`

```typescript
// Change from Phone icon to Upload icon
import { Upload } from "lucide-react";

// In render:
<Upload className="h-6 w-6" />
```

---

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HENKEL APP                          HAPPYROBOT PLATFORM               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Queue Processor ─────POST────────→ Incoming Webhook                    │
│  (dequeues batch)      payload:      │                                  │
│                        - supplier    │                                  │
│                        - POs list    ▼                                  │
│                        - callback   AI Agent (voice call)               │
│                          URL         │                                  │
│                                      ├─→ Tool: send_update ────────┐   │
│                                      │     (real-time logs)        │   │
│  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │ POST /api/webhooks/happyrobot ←─────────────────────────────┘  │   │
│  │   │                                                             │   │
│  │   ├─→ Save to POActivityLog (PostgreSQL)                       │   │
│  │   ├─→ Publish to Redis channel `batch:{id}:logs`               │   │
│  │   └─→ Update PO/Batch status if needed                         │   │
│  └──────────────────────────────────────────────────────────────┘  │   │
│                                      │                              │   │
│  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │ GET /api/batches/[id]/events (SSE)                            │  │   │
│  │   │                                                            │  │   │
│  │   └─→ Subscribe to Redis `batch:{id}:logs`                    │  │   │
│  │       Stream events to connected clients                       │  │   │
│  └──────────────────────────────────────────────────────────────┘  │   │
│          │                                                          │   │
│          ▼                           │                              │   │
│  BatchModal (UI)                     ├─→ Tool: mark_po_resolved ───┘   │
│  - Live logs panel                   │     (PO outcome)                 │
│  - PO status updates                 │                                  │
│  - HappyRobot link                   └─→ Final webhook (call complete) │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 6.1 HappyRobot Workflow Design (Manual - in HR Dashboard)

Create a workflow in HappyRobot with the following structure:

```
📥 Incoming Webhook
   │  API Key: ${HAPPYROBOT_X_API_KEY}
   │  Expected payload:
   │    - batch_id: string
   │    - callback_url: string
   │    - supplier: { name, phone, supplierNumber }
   │    - purchase_orders: [{ id, poNumber, poLine, actionType, dueDate, recommendedDate, value }]
   │
   ▼
🤖 AI Agent: "Henkel PO Caller"
   │
   │  PROMPT:
   │  You are calling on behalf of Henkel to discuss purchase order changes.
   │  Supplier: {{supplier.name}} ({{supplier.supplierNumber}})
   │  Phone: {{supplier.phone}}
   │
   │  You have {{purchase_orders.length}} PO actions to discuss:
   │  {{#each purchase_orders}}
   │    - PO {{poNumber}} Line {{poLine}}: {{actionType}}
   │      {{#if actionType == "CANCEL"}}Request cancellation{{/if}}
   │      {{#if actionType == "EXPEDITE"}}Move from {{dueDate}} to {{recommendedDate}}{{/if}}
   │      {{#if actionType == "PUSH_OUT"}}Move from {{dueDate}} to {{recommendedDate}}{{/if}}
   │  {{/each}}
   │
   │  For each PO, confirm the action with the supplier and use the appropriate tool.
   │  Be professional, concise, and document their responses.
   │
   ├─── 🔧 Tool: send_update
   │         Description: "Send a real-time status update to Henkel dashboard"
   │         Parameters: { message: string, status: "INFO"|"SUCCESS"|"WARNING"|"ERROR" }
   │         └─→ 🌐 Webhook POST to {{callback_url}}
   │               Body: { event_type: "log", batch_id, message, status, source: "AGENT" }
   │
   ├─── 🔧 Tool: mark_po_resolved
   │         Description: "Mark a PO as resolved after supplier confirmation"
   │         Parameters: { po_id: string, outcome: "CONFIRMED"|"REJECTED"|"PARTIAL", notes: string }
   │         └─→ 🌐 Webhook POST to {{callback_url}}
   │               Body: { event_type: "po_resolved", batch_id, po_id, outcome, notes }
   │
   ├─── 🔧 Tool: request_callback
   │         Description: "Supplier requested to be called back later"
   │         Parameters: { reason: string, suggested_time?: string }
   │         └─→ 🌐 Webhook POST to {{callback_url}}
   │               Body: { event_type: "callback_requested", batch_id, reason, suggested_time }
   │
   └─── 🔧 Tool: escalate_issue
             Description: "Flag an issue requiring human attention"
             Parameters: { issue: string, severity: "LOW"|"MEDIUM"|"HIGH" }
             └─→ 🌐 Webhook POST to {{callback_url}}
                   Body: { event_type: "escalation", batch_id, issue, severity }
   │
   ▼
✨ AI Extract
   │  Extract structured outcome:
   │    - overall_outcome: "SUCCESS"|"PARTIAL"|"FAILED"|"CALLBACK"
   │    - summary: string
   │    - resolved_count: number
   │    - failed_count: number
   │
   ▼
🌐 Final Webhook POST to {{callback_url}}
      Body: {
        event_type: "call_complete",
        batch_id,
        run_id: {{run_id}},
        outcome: {{overall_outcome}},
        summary: {{summary}},
        duration_seconds: {{duration}}
      }
```

**Environment Variables Needed**:

```bash
HAPPYROBOT_WEBHOOK_URL=https://hooks.happyrobot.ai/webhook/xxxxx  # Incoming webhook URL
HAPPYROBOT_X_API_KEY=<api-key-set-in-incoming-hook>              # For triggering
HAPPYROBOT_API_KEY=hr_api_xxxxx                                   # Platform API key
HAPPYROBOT_ORG_ID=org_xxxxx                                       # Organization ID
HAPPYROBOT_ORG_SLUG=henkel                                       # For UI URLs
HAPPYROBOT_WORKFLOW_ID=<workflow-id>                              # For UI URLs
```

---

### 6.2 Database: Batch Log Storage

Two storage mechanisms for batch logs:

**1. BatchLog Model (New)** - For timeline persistence:

```prisma
model BatchLog {
  id        String   @id @default(cuid())
  batchId   String
  type      String   // "log", "po_update", "status_change"
  level     String   @default("info")
  message   String?
  data      Json?
  createdAt DateTime @default(now())

  batch SupplierBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId])
  @@map("batch_logs")
}
```

Logs persist to database so they survive modal close/reopen. Loaded on modal open, combined with live SSE.

**2. POActivityLog** - For audit trail:

```typescript
// Audit entry format:
{
  entityType: "BATCH",
  entityId: batchId,
  action: "LOG" | "PO_RESOLVED" | "CALLBACK_REQUESTED" | "ESCALATION" | "CALL_COMPLETE",
  details: { ... }
}
```

---

### 6.3 Redis: Real-Time Event Channel

Add batch log channel to existing Redis infrastructure:

**File**: `src/lib/redis.ts`

```typescript
// Add to CHANNELS:
export const CHANNELS = {
  // ... existing
  BATCH_LOGS: (batchId: string) => `batch:${batchId}:logs`,
};

// Add batch log event type:
export interface BatchLogEvent {
  type: "log" | "po_resolved" | "callback_requested" | "escalation" | "call_complete";
  batchId: string;
  data: {
    message?: string;
    status?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
    source?: string;
    poId?: string;
    outcome?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

// Publish function:
export async function publishBatchLog(batchId: string, event: BatchLogEvent) {
  const redis = getRedis();
  await redis.publish(CHANNELS.BATCH_LOGS(batchId), JSON.stringify(event));
}
```

---

### 6.4 API: Webhook Handler

**File**: `src/app/api/webhooks/happyrobot/route.ts`

```typescript
// POST /api/webhooks/happyrobot
// Handles all webhook events from HappyRobot workflow

interface WebhookPayload {
  event_type: "log" | "po_resolved" | "callback_requested" | "escalation" | "call_complete";
  batch_id: string;
  run_id?: string;
  // Event-specific fields...
}

export async function POST(request: Request) {
  // 1. Validate X-API-KEY header
  // 2. Parse payload
  // 3. Switch on event_type:

  switch (payload.event_type) {
    case "log":
      // Save to POActivityLog
      // Publish to Redis channel
      break;

    case "po_resolved":
      // Update PurchaseOrder.status (COMPLETED | FAILED)
      // Save to POActivityLog
      // Publish to Redis channel
      break;

    case "callback_requested":
      // Update Batch.scheduledFor
      // Update Batch.status = QUEUED
      // Save to POActivityLog
      // Publish to Redis channel
      break;

    case "escalation":
      // Create POConflict record
      // Save to POActivityLog
      // Publish to Redis channel
      break;

    case "call_complete":
      // Update POAgentRun (endedAt, outcome, duration)
      // Update Batch.status based on outcome
      // Update Batch.lastOutcome, lastOutcomeReason
      // Remove supplier from in-progress set
      // Save to POActivityLog
      // Publish to Redis channel
      break;
  }

  return Response.json({ success: true });
}
```

---

### 6.5 API: SSE Event Stream for Batch Logs

**File**: `src/app/api/batches/[id]/events/route.ts`

Adapt existing SSE pattern from `/api/upload/progress/[jobId]/route.ts`:

```typescript
// GET /api/batches/[id]/events
// SSE stream for real-time batch log updates

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const batchId = params.id;

  // 1. Verify batch exists
  // 2. Create Redis subscriber for `batch:${batchId}:logs` channel
  // 3. Stream events as they arrive
  // 4. Also fetch historical logs from POActivityLog on connect

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const subscriber = createSubscriber();

      // Send historical logs first
      const historicalLogs = await prisma.pOActivityLog.findMany({
        where: { entityType: "BATCH", entityId: batchId },
        orderBy: { createdAt: "asc" },
      });

      for (const log of historicalLogs) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "historical", log })}\n\n`)
        );
      }

      // Subscribe to real-time updates
      await subscriber.subscribe(CHANNELS.BATCH_LOGS(batchId));

      subscriber.on("message", (channel, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      // Handle disconnect
      request.signal.addEventListener("abort", () => {
        subscriber.unsubscribe();
        subscriber.quit();
        controller.close();
      });
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
```

---

### 6.6 Client Hook: useBatchLogs

**File**: `src/hooks/use-batch-logs.ts`

Adapt existing `useSSEEvents` pattern:

```typescript
interface BatchLog {
  id: string;
  timestamp: string;
  message: string;
  source: string;
  status: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  poId?: string;
  outcome?: string;
}

interface UseBatchLogsReturn {
  logs: BatchLog[];
  isConnected: boolean;
  isLoading: boolean;
  latestEvent: BatchLogEvent | null;
}

export function useBatchLogs(batchId: string | null, enabled = true): UseBatchLogsReturn {
  const [logs, setLogs] = useState<BatchLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!batchId || !enabled) return;

    const eventSource = new EventSource(`/api/batches/${batchId}/events`);

    eventSource.onopen = () => setIsConnected(true);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "historical") {
        // Batch add historical logs
        setLogs((prev) => [...prev, transformLog(data.log)]);
      } else {
        // Real-time log
        setLogs((prev) => [...prev, transformLog(data)]);
      }
    };

    eventSource.onerror = () => setIsConnected(false);

    return () => eventSource.close();
  }, [batchId, enabled]);

  return { logs, isConnected, isLoading: !isConnected, latestEvent };
}
```

---

### 6.7 UI: Enhanced BatchModal

**File**: `src/components/suppliers/BatchModal.tsx`

Enhance existing modal with:

1. **HappyRobot Link** in header (when `lastAgentRun.externalUrl` exists)
2. **Live Logs Panel** below timeline (when batch is IN_PROGRESS)
3. **Real-time PO Status** in table (subscribe to events)

```typescript
// Changes to BatchModal:

export function BatchModal({ batch, supplierName, onClose }: BatchModalProps) {
  // Existing state...

  // NEW: Subscribe to batch logs when IN_PROGRESS
  const { logs, isConnected } = useBatchLogs(
    batch.status === "IN_PROGRESS" ? batch.id : null
  );

  // NEW: Track PO statuses locally for real-time updates
  const [poStatuses, setPoStatuses] = useState<Record<string, string>>({});

  // Update PO status when po_resolved event arrives
  useEffect(() => {
    const latestLog = logs[logs.length - 1];
    if (latestLog?.type === "po_resolved" && latestLog.poId) {
      setPoStatuses(prev => ({
        ...prev,
        [latestLog.poId]: latestLog.outcome
      }));
    }
  }, [logs]);

  return (
    <div className="...">
      {/* Header - ADD HappyRobot link */}
      <div className="header">
        <h2>Batch {batch.id.slice(0, 8)}</h2>
        {batch.lastAgentRun?.externalUrl && (
          <a href={batch.lastAgentRun.externalUrl} target="_blank">
            View in HappyRobot ↗
          </a>
        )}
      </div>

      {/* Left Panel - POs with real-time status */}
      <div className="left-panel">
        <table>
          {sortedPOs.map(po => (
            <tr key={po.id}>
              <td>{po.poNumber}</td>
              <td>{po.actionType}</td>
              <td>
                <POStatusBadge
                  status={poStatuses[po.id] || po.status}
                />
              </td>
              <td>{formatCurrency(po.calculatedTotalValue)}</td>
            </tr>
          ))}
        </table>
      </div>

      {/* Right Panel - Timeline + Live Logs */}
      <div className="right-panel">
        {/* Existing Timeline */}
        <div className="timeline">
          {timelineEvents.map(event => (
            <TimelineEvent key={event.id} {...event} />
          ))}
        </div>

        {/* NEW: Live Logs (when IN_PROGRESS) */}
        {batch.status === "IN_PROGRESS" && (
          <div className="live-logs">
            <div className="header">
              <Terminal className="icon" />
              <span>Live Logs</span>
              {isConnected && <span className="pulse">●</span>}
            </div>
            <div className="log-stream">
              {logs.map(log => (
                <div key={log.id} className={`log ${log.status.toLowerCase()}`}>
                  <span className="time">{formatTime(log.timestamp)}</span>
                  <span className="source">{log.source}</span>
                  <span className="message">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### 6.8 HappyRobot Call Provider

**Files**:

- `src/lib/call-provider.ts` - Abstract interface
- `src/lib/providers/happyrobot.ts` - HappyRobot implementation

**Key Concept**: One phone call per batch. A batch contains one supplier and up to 10 POs to discuss in that single call.

```typescript
// src/lib/call-provider.ts - Interface
interface CallBatchData {
  batch: SupplierBatch & { supplier: Supplier; purchaseOrders: PurchaseOrder[] };
  callbackUrl: string;
  attemptNumber: number;
}

interface CallTriggerResult {
  success: boolean;
  runId?: string;
  externalUrl?: string;
  error?: string;
}

interface CallProvider {
  name: string;
  triggerCall(data: CallBatchData): Promise<CallTriggerResult>;
  getCallStatus(runId: string): Promise<CallStatusResult>;
  getCallUrl(runId: string): string;
}

// src/lib/providers/happyrobot.ts - Implementation
class HappyRobotProvider implements CallProvider {
  async triggerCall(data: CallBatchData): Promise<CallTriggerResult> {
    const { batch, callbackUrl, attemptNumber } = data;

    // Payload sent to HappyRobot webhook - ONE call to discuss ALL POs in batch
    const payload = {
      callback_url: callbackUrl,
      batch_id: batch.id,
      attempt: attemptNumber,
      supplier: {
        id: batch.supplier.id,
        name: batch.supplier.name,
        phone: batch.supplier.phone,
        supplierNumber: batch.supplier.supplierNumber,
      },
      // All POs to discuss in this single phone call
      purchase_orders: batch.purchaseOrders.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        poLine: po.poLine,
        actionType: po.actionType,
        dueDate: po.dueDate?.toISOString(),
        recommendedDate: po.recommendedDate?.toISOString(),
        calculatedTotalValue: po.calculatedTotalValue.toNumber(),
      })),
      stats: {
        totalPOs: batch.purchaseOrders.length,
        totalValue: batch.totalValue.toNumber(),
        actionTypes: batch.actionTypes,
      },
    };

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    // Returns runId for tracking the call
    const result = await response.json();
    return {
      success: true,
      runId: result.queued_run_ids[0],
      externalUrl: this.getCallUrl(result.queued_run_ids[0]),
    };
  }
}
```

---

### 6.9 Queue Processor

**File**: `src/lib/queue-processor.ts`

```typescript
export async function processQueue(): Promise<void> {
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CALLS || "5");

  // 1. Check current in-progress count
  const inProgressCount = await getInProgressCount();
  if (inProgressCount >= maxConcurrent) {
    console.log(`Max concurrent calls reached (${inProgressCount}/${maxConcurrent})`);
    return;
  }

  // 2. Dequeue next batch (respecting supplier concurrency)
  const batch = await dequeueNextBatch();
  if (!batch) {
    console.log("No batches ready for processing");
    return;
  }

  // 3. Check supplier is not already being called
  const supplierBusy = await isSupplierInProgress(batch.supplierId);
  if (supplierBusy) {
    // Re-queue and try next
    await requeueBatch(batch.id);
    return processQueue(); // Recursive to try next batch
  }

  // 4. Mark supplier as in-progress
  await markSupplierInProgress(batch.supplierId);

  // 5. Update batch status
  await prisma.supplierBatch.update({
    where: { id: batch.id },
    data: { status: "IN_PROGRESS" },
  });

  // 6. Update all POs in batch
  await prisma.purchaseOrder.updateMany({
    where: { batchId: batch.id },
    data: { status: "IN_PROGRESS" },
  });

  // 7. Trigger call to supplier (one call for entire batch)
  try {
    const result = await callProvider.triggerCall({
      batch,
      callbackUrl: `${process.env.APP_URL}/api/webhooks/happyrobot`,
      attemptNumber: batch.attemptCount + 1,
    });

    // 8. Create POAgentRun record
    await prisma.pOAgentRun.create({
      data: {
        batchId: batch.id,
        externalId: result.runIds[0],
        externalUrl: result.externalUrl,
        status: "IN_PROGRESS",
        attempt: batch.attemptCount + 1,
        startedAt: new Date(),
      },
    });

    // 9. Log the event
    await logBatchEvent(batch.id, {
      action: "CALL_STARTED",
      details: {
        attempt: batch.attemptCount + 1,
        externalUrl: result.externalUrl,
      },
    });
  } catch (error) {
    // Handle trigger failure
    await markSupplierNotInProgress(batch.supplierId);
    await prisma.supplierBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", lastOutcome: "TRIGGER_FAILED" },
    });
    throw error;
  }
}
```

---

### 6.10 Supplier Concurrency Control

**Redis Keys**:

```
supplier:in_progress  - SET of supplier IDs currently being called
```

**Functions** (add to `src/lib/queue.ts`):

```typescript
export async function isSupplierInProgress(supplierId: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.sismember("supplier:in_progress", supplierId)) === 1;
}

export async function markSupplierInProgress(supplierId: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd("supplier:in_progress", supplierId);
}

export async function markSupplierNotInProgress(supplierId: string): Promise<void> {
  const redis = getRedis();
  await redis.srem("supplier:in_progress", supplierId);
}
```

---

### 6.11 Cron Endpoint

**File**: `src/app/api/cron/process-queue/route.ts`

```typescript
export async function GET(request: Request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await processQueue();
    return Response.json({ success: true });
  } catch (error) {
    console.error("Queue processing error:", error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
```

**Railway Cron**: `*/1 * * * *` (every minute)

---

### 6.12 Implementation Checklist

**Upload Flow Redesign**:

- [x] Modify upload API for chunked batch processing (max 10 POs/batch, 50 batches/chunk)
- [x] Add progressive enqueue with SSE events
- [x] Create `GET /api/pipeline/events` SSE endpoint
- [x] Add `PIPELINE_EVENTS` channel to Redis
- [x] Add `publishPipelineEvent()` function
- [x] Change Upload FAB icon from Phone to Upload

**Pipeline Real-Time Updates**:

- [x] Subscribe to `/api/pipeline/events` in dashboard via `usePipelineEvents` hook
- [x] Debounced refresh (300ms) for batching SSE events
- [x] Update stage counts on SSE events (auto-refresh stats)
- [x] Add subtle pulse animation on SankeyNode when count changes (icon pulse + border glow)
- [x] Remove blocking opacity during refresh (non-blocking updates)

**HappyRobot Dashboard** (Manual):

- [ ] Create workflow with Incoming Webhook
- [ ] Add AI Agent with PO caller prompt
- [ ] Add tools: `send_update`, `mark_po_resolved`, `request_callback`, `escalate_issue`
- [ ] Add webhook nodes for each tool
- [ ] Add AI Extract for structured outcome
- [ ] Add final webhook for call completion
- [ ] Configure API key and test

**Backend - HappyRobot Integration**:

- [x] Add batch log channel to `src/lib/redis.ts`
- [x] Create `src/lib/providers/happyrobot.ts` with `triggerCall()` (batch-based)
- [x] Create `src/lib/call-provider.ts` (abstraction layer)
- [x] Create `src/lib/queue-processor.ts`
- [x] Add supplier concurrency functions to `src/lib/queue.ts`
- [x] Create `POST /api/webhooks/happyrobot` endpoint
- [x] Create `GET /api/batches/[id]/events` SSE endpoint
- [x] Create `GET /api/cron/process-queue` endpoint
- [ ] Add environment variables to Railway
- [ ] Configure Railway Cron job (`*/1 * * * *` - every minute)

**Frontend - BatchModal**:

- [x] Create `src/hooks/use-batch-logs.ts`
- [x] Enhance `BatchModal.tsx`:
  - [x] Add HappyRobot link in header
  - [x] Add live logs panel (timeline with SSE subscription)
  - [x] Add real-time PO status updates (inline status badges)
  - [x] Close on Escape key
  - [x] Auto-close on batch completion (3s delay)
  - [x] `onBatchUpdate` callback to update parent BatchCard/KPIs
  - [x] `onPOResolved` callback for per-PO KPI updates
  - [x] Auto-scroll timeline on new events
- [x] PO status badges (integrated inline in BatchModal)

**Frontend - UploadModal**:

- [x] Close on Escape key
- [x] Fix FAB badge not showing during uploads (skip polling temp IDs)

**Testing**:

- [x] Test webhook handler with mock payloads (test scripts created)
- [x] Test SSE stream with browser (BatchModal live logs working)
- [x] Test real-time KPI updates on PO resolution
- [ ] Test progressive enqueue sends SSE events
- [ ] Test pipeline animates on SSE events
- [ ] Test queue processor dequeues correctly
- [ ] Test supplier concurrency prevents double-calling
- [ ] End-to-end: Upload → Queue → Process → Call → Webhooks → UI Updates

---

### 6.13 Files Summary

| File                                            | Purpose                                  | Status |
| ----------------------------------------------- | ---------------------------------------- | ------ |
| `src/app/api/pipeline/events/route.ts`          | Pipeline SSE stream                      | ✅     |
| `src/app/api/upload/pos/route.ts`               | Chunked batch processing with SSE        | ✅     |
| `src/lib/redis.ts`                              | `PIPELINE_EVENTS`, `BATCH_LOGS` channels | ✅     |
| `src/lib/call-provider.ts`                      | Call provider abstraction                | ✅     |
| `src/lib/providers/happyrobot.ts`               | HappyRobot implementation                | ✅     |
| `src/lib/queue-processor.ts`                    | Queue processing logic                   | ✅     |
| `src/lib/queue.ts`                              | Supplier concurrency functions           | ✅     |
| `src/app/api/webhooks/happyrobot/route.ts`      | Webhook handler                          | ✅     |
| `src/app/api/batches/[id]/events/route.ts`      | Batch logs SSE stream                    | ✅     |
| `src/app/api/cron/process-queue/route.ts`       | Cron trigger endpoint                    | ✅     |
| `src/hooks/use-batch-logs.ts`                   | Client-side batch log subscription       | ✅     |
| `src/hooks/use-pipeline-events.ts`              | Pipeline event subscription              | ✅     |
| `src/components/pipeline/batches-pipeline.tsx`  | Non-blocking refresh, no opacity fade    | ✅     |
| `src/components/pipeline/sankey/SankeyNode.tsx` | Pulse animation on data changes          | ✅     |
| `src/components/suppliers/BatchModal.tsx`       | Live logs, SSE, auto-close, callbacks    | ✅     |
| `src/components/suppliers/BatchCard.tsx`        | 3-column grid layout, status updates     | ✅     |
| `src/components/suppliers/SupplierInsights.tsx` | Real-time KPI updates via callbacks      | ✅     |
| `src/app/(app)/suppliers/[id]/page.tsx`         | SSE callbacks, grid layout, no PENDING   | ✅     |
| `src/components/upload/UploadFAB.tsx`           | Upload icon, fixed badge polling         | ✅     |
| `src/components/upload/UploadModal.tsx`         | Escape key handler                       | ✅     |
| `prisma/schema.prisma`                          | BatchLog model, removed PENDING status   | ✅     |

### 6.14 Railway Cron Setup (Manual)

Configure via Railway Dashboard:

1. Go to your project in Railway Dashboard
2. Select the App service
3. Go to **Settings** → **Cron**
4. Add cron job:
   - **Schedule**: `*/1 * * * *` (every minute)
   - **Endpoint**: `/api/cron/process-queue`
   - **Method**: GET
   - **Headers**: `Authorization: Bearer ${CRON_SECRET}`

**Environment Variables Required**:

```
CRON_SECRET=<generate-secure-random-string>
HAPPYROBOT_WEBHOOK_URL=https://hooks.happyrobot.ai/webhook/xxxxx
HAPPYROBOT_X_API_KEY=<api-key-from-hr-incoming-hook>
HAPPYROBOT_ORG_SLUG=henkel
HAPPYROBOT_WORKFLOW_ID=<workflow-id>
APP_URL=https://henkel-po-caller-production.up.railway.app
```

---

## Phase 7: Retry & Callback Logic

**Goal**: Smart retry scheduling with business hours.

### 7.1 Retry Scheduler

- [ ] Create `/lib/retry-scheduler.ts`:
  - `calculateNextCallTime()` - Business hours rotation
  - `adjustToBusinessHours()` - Skip weekends, outside hours
  - `shouldRetry()` - Based on outcome
  - Retry schedule: immediate, 2h, 4h, 24h, 24h

### 7.2 Callback Queue Processing

- [ ] `GET /api/cron/process-callbacks` - Process due callbacks
- [ ] Re-enqueue batches whose `scheduledFor` is past
- [ ] Increment attempt count

### 7.3 Max Retry Handling

- [ ] After 5 attempts, mark batch as FAILED
- [ ] Mark all POs in batch as FAILED
- [ ] Log to `POActivityLog`

### 7.4 Webhook Integration

- [ ] On callback_requested -> schedule retry
- [ ] On no_answer -> schedule retry
- [ ] On success -> mark complete
- [ ] On rejected -> mark failed (no retry)

### 7.5 Verification

- [ ] No-answer triggers scheduled callback
- [ ] Callbacks processed at correct times
- [ ] Max retries exhausted -> status FAILED
- [ ] Business hours respected

**Files**: `src/lib/retry-scheduler.ts`, `src/app/api/cron/process-callbacks/route.ts`

---

## Phase 8: Dashboard UI [IN PROGRESS]

**Goal**: Streamlined monitoring dashboard with 3 main pages.

### 8.1 Layout & Navigation

- [x] Create app layout with sidebar
- [ ] Navigation: **Dashboard**, **Suppliers**, **Settings**
- [x] Keep auth protection

### 8.2 Dashboard Home (`/dashboard`) [PARTIAL]

- [x] **KPI Cards**: Total POs, Completed, Success Rate, Pending Value
  - Dynamic KPI generation from stats response
  - Trend indicators with up/down arrows
  - Color-coded by metric type (success, warning, info, danger)
- [x] **Queue Pipeline Visualization**: Sankey-style diagram showing batch flow
  - Single-row layout: PENDING → QUEUED → IN_PROGRESS → COMPLETED/FAILED/PARTIAL
  - Flow links with horizontal gradient colors (source → target stage)
  - Click-to-expand split-view table with batch details
  - GSAP Flip animations for smooth transitions
  - Value/Count toggle to switch between views
- [ ] **Active Calls**: Currently in-progress calls with live status
- [ ] **Alerts**: Conflicts, failed calls, items needing attention
- [ ] Real-time updates via SSE (pipeline polling)

### 8.2.1 Pipeline Components (adapted from UNIR)

```
src/components/pipeline/
├── index.ts                    # Exports
├── pipeline-types.ts           # BatchStatus, StageConfig, etc.
├── pipeline-skeleton.tsx       # Loading skeleton
├── kpi-utils.ts               # KPI generation from stats
├── batches-pipeline.tsx       # Main component with ExpandableGrid
└── sankey/
    ├── index.ts               # Sankey exports
    ├── sankey-types.ts        # SankeyLayout, SankeyViewMode
    ├── sankey-utils.ts        # Path generation, formatting
    ├── SankeyDiagram.tsx      # Main SVG visualization
    ├── SankeyNode.tsx         # Stage node rendering
    ├── SankeyLink.tsx         # Flow link with gradients
    ├── SankeyTooltip.tsx      # Hover tooltips
    ├── useSankeyLayout.ts     # Layout calculation (single-row)
    └── useSankeyAnimation.ts  # GSAP entry/transition animations
```

### 8.2.2 Key Features

- **Single-row Sankey layout**: QUEUED → IN_PROGRESS → COMPLETED/FAILED/PARTIAL
- **Unique node keys**: `${stageId}_main` or `${stageId}_outcome` for proper React rendering
- **Horizontal gradients**: Left-to-right color flow matching data direction
- **ExpandableGrid split-view**: Sankey compresses (12→5 cols) when table opens
- **GSAP animations**: Entry animations with stagger, view mode transitions
- **Pulse animation**: SankeyNode icon pulses when count changes via SSE

### 8.2.3 Empty State & First Upload Flow [DONE]

- [x] **EmptyPipelineState component** - Shown when no POs uploaded
  - Animated pipeline illustration with GSAP
  - "Upload PO File" CTA button
  - Detects active uploads and shows progress card instead
- [x] **Upload Progress Indicator** - When upload in progress on empty state
  - Shows file name, progress bar, current stage
  - "View Details" button to reopen modal
- [x] **FAB visibility logic** - Hidden on empty, animates in when data arrives
- [x] **Entrance Animation** - GSAP animation when first data arrives
  - KPI cards stagger in from bottom with `back.out` ease
  - Pipeline header fades in
  - Pipeline container scales up
- [x] **onUploadComplete callback** - Dashboard auto-refreshes when upload completes
- [x] **Real API integration** - Dashboard calls `/api/batches/stats` (falls back to empty on 404)

### 8.2.4 Demo Reset Feature [DONE]

- [x] **Reset API** (`POST /api/reset`) - Clears all data back to initial state
  - Clears Redis queues
  - Deletes: agent runs, batches, conflicts, POs, suppliers (respects FK order)
- [x] **Hidden Reset Button** - In sidebar, above Settings
  - Fully invisible until hovering directly over button area
  - Uses `group-hover` pattern with `opacity-0` and `text-transparent`
  - Red hover state to indicate destructive action
  - Reloads page after reset to refresh all data

### 8.2.5 Pipeline Table Enhancements [DONE]

- [x] **Search** - Filter batches by supplier name or number
- [x] **Action Filter** - FilterDropdown to filter by action type (Cancel, Expedite, Push Out)
- [x] **Sorting** - Sort by PO count, value, supplier name, or date
- [x] **FilterDropdown component** - Reusable dropdown with clear button, keyboard support
- [x] **Tally4 icon** - Updated QUEUED stage to use Tally4 icon from Lucide
- [x] **Clear filters** - Button to reset all filters, shown when filters are active
- [x] **Filtered counts** - Shows "X of Y batches" when filtered

### 8.3 Supplier Detail Page (`/suppliers/[id]`) [DONE]

**Design Decision**: The supplier page is the central "command center" for managing PO actions with a supplier. Clicking a batch from the dashboard navigates here (no separate `/batches/[id]` page).

#### 8.3.1 Top Section - Supplier Overview

**Header Card:**

- [x] Supplier name (large)
- [x] Supplier number badge (e.g., `#81096`)
- [x] Primary phone number with click-to-copy
- [x] Email address with click-to-copy
- [x] Contact name (if available)

**Insights Grid (6 KPI cards):**

- [x] **Action Required**: Count of POs needing action (in queued batches)
- [x] **In Progress**: POs currently being processed
- [x] **Completed**: Successfully actioned POs
- [x] **Success Rate**: % of batches completed vs failed
- [x] **Needs Review**: Count of failed/partial POs
- [x] **Total Value**: Total PO value for supplier
- [x] **Real-time updates**: KPIs update via SSE on batch/PO status changes

#### 8.3.2 Bottom Section - Batches List

**Batch filters:**

- [x] Status filter pills: All | Queued | In Progress | Completed | Failed | Partial
- [x] Search within batches
- [x] Default sort by value (highest first)

**Batch cards (3-column grid, clickable):**

- [x] Status badge with icon
- [x] PO count, total value, action type tags
- [x] Attempt count indicator (with warning color near max)
- [x] Timing info (created/scheduled/completed based on status)
- [x] Click anywhere → opens Batch Detail Modal
- [x] Real-time status updates via SSE

#### 8.3.3 Batch Detail Modal [DONE]

Opens immediately when clicking any batch card.

**Layout: Split Panel**

**Header:**

- [x] Batch ID (full UUID, monospace)
- [x] Status badge with real-time updates
- [x] Supplier name
- [x] HappyRobot link (when agent run exists)
- [x] "Batch completed - closing..." indicator on success
- [x] Close on Escape key

**Left Panel (60%) - POs in Batch:**

- [x] Table with columns: PO#, Line, Part, Due Date, Value, Action, Status
- [x] Sortable by value (asc/desc toggle)
- [x] Total row at bottom
- [x] Real-time PO status badges (update via SSE)
- [x] Action-specific success labels (Cancelled, Pushed Out, Expedited)

**Right Panel (40%) - Activity Timeline:**

- [x] Chronological activity log with icons
- [x] Base events: Batch created & queued, Call started, Call completed
- [x] Persisted logs from database (survive modal close/reopen)
- [x] Live SSE logs with "Live" indicator
- [x] Auto-scroll to bottom on new events
- [x] Scrollable container constrained to match PO panel height

**Real-time Features:**

- [x] SSE subscription when batch is IN_PROGRESS or PARTIAL
- [x] Auto-close modal 3 seconds after successful completion
- [x] `onBatchUpdate` callback updates parent BatchCard and KPIs
- [x] `onPOResolved` callback updates KPIs per individual PO

**Modal Actions:**

- [x] "Start Call" button (if queued) - triggers HappyRobot with demo phone override
- [ ] "Retry" (if failed)
- [ ] "Mark Resolved" (manual override)
- [ ] "Export PO List" (CSV)

### 8.4 Suppliers List Page (`/suppliers`) [DONE]

- [x] Suppliers table with search/filter
- [x] Columns: Name, Supplier #, Phone, POs, Batches, Status, Total Value
- [x] Click row → navigate to supplier detail
- [x] Status indicator (colored dot): pending actions, completed, failed
- [x] Sortable columns (name, value, PO count, batch count)
- [x] Pagination support

### 8.5 Navigation Changes [DONE]

- [x] Dashboard batch click → `/suppliers/[supplierId]?batch=[batchId]`
  - Opens batch modal directly
- [x] Sidebar: Dashboard | Suppliers | Settings

### 8.6 Conflicts Management

**What are conflicts?**
Conflicts occur when the same PO (PO# + Line) has conflicting instructions:

1. **Duplicate Upload**: Same PO in multiple files with different actions (CANCEL vs EXPEDITE)
2. **Action Collision**: PO already processed but appears in new upload
3. **Date Conflict**: Contradictory recommended dates

**Conflict UI:**

- [ ] Alert badge in dashboard header when conflicts exist
- [ ] Conflicts section on supplier page (if that supplier has conflicts)
- [ ] Conflict resolution modal:
  - Show both versions side-by-side
  - "Keep Original" | "Use New" | "Skip/Ignore"
  - Resolution notes field
  - Track who resolved and when

### 8.7 Settings Page (`/settings`)

- [ ] System config editor
- [ ] Max batch size (default: 15), retry attempts, business hours, timezone
- [ ] HappyRobot connection status
- [ ] Webhook URL display (for HR configuration)

### 8.8 Verification

- [ ] Supplier page loads with all sections
- [ ] Batch modal shows POs and timeline
- [ ] Navigation from dashboard works
- [ ] Timeline populates from activity log
- [ ] Conflicts display and can be resolved

**Files**:

- `src/app/(app)/suppliers/page.tsx`
- `src/app/(app)/suppliers/[id]/page.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/components/suppliers/SupplierHeader.tsx`
- `src/components/suppliers/SupplierInsights.tsx`
- `src/components/suppliers/BatchCard.tsx`
- `src/components/suppliers/BatchModal.tsx`
- `src/components/suppliers/BatchTimeline.tsx`
- `src/components/suppliers/ConflictAlert.tsx`

---

## Phase 9: Activity Logging & Timeline

**Goal**: Comprehensive activity tracking for batch timeline.

### 9.1 Activity Log Events

Track all significant events in `POActivityLog`:

```typescript
// Event types to log
type ActivityAction =
  | "BATCH_CREATED"
  | "BATCH_QUEUED"
  | "BATCH_DEQUEUED"
  | "CALL_SCHEDULED"
  | "CALL_STARTED"
  | "CALL_COMPLETED"
  | "CALL_FAILED"
  | "CALL_NO_ANSWER"
  | "CALLBACK_SCHEDULED"
  | "PO_RESOLVED"
  | "PO_FAILED"
  | "BATCH_COMPLETED"
  | "BATCH_FAILED"
  | "BATCH_PARTIAL"
  | "CONFLICT_DETECTED"
  | "CONFLICT_RESOLVED"
  | "MANUAL_OVERRIDE";
```

### 9.2 Logging Integration Points

- [ ] Upload flow: Log `BATCH_CREATED` for each batch
- [ ] Queue processor: Log `BATCH_QUEUED`, `CALL_STARTED`
- [ ] Webhook handler: Log `CALL_COMPLETED`, `CALL_FAILED`, `CALL_NO_ANSWER`
- [ ] Retry scheduler: Log `CALLBACK_SCHEDULED`
- [ ] PO resolution: Log `PO_RESOLVED`, `PO_FAILED`
- [ ] Conflict detection: Log `CONFLICT_DETECTED`

### 9.3 Timeline API

- [ ] `GET /api/batches/[id]/timeline` - Returns activity log for a batch
- [ ] `GET /api/suppliers/[id]/activity` - Returns recent activity for supplier
- [ ] Include related `POAgentRun` data for call details

**Files**: `src/lib/activity-logger.ts`, `src/app/api/batches/[id]/timeline/route.ts`

---

## Phase 10: Authentication & Security Hardening

**Goal**: Production-grade authentication with multiple providers, password recovery, and API protection.

### 10.0 Current State Assessment

**What's Implemented**:

- NextAuth.js v4 with JWT session strategy
- Credentials provider (email/password)
- bcryptjs password hashing (cost factor 10)
- Client-side route protection via AuthGuard component
- Demo user seeded (`admin@henkel.com`)

**Security Gaps Identified**:

1. **API routes unprotected** - No session validation on `/api/suppliers`, `/api/batches`, etc.
2. **Reset endpoint exposed** - `/api/reset` has no authentication
3. **No role enforcement** - ADMIN/OPERATOR roles stored but never checked
4. **No rate limiting** - Brute force login attacks possible
5. **No password recovery** - Users cannot reset forgotten passwords
6. **Single auth provider** - Only email/password, no SSO options

---

### 10.1 API Route Protection

**Priority**: CRITICAL

Add session validation to all data API routes.

**Middleware Approach** (`middleware.ts`):

```typescript
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/api/suppliers/:path*",
    "/api/batches/:path*",
    "/api/upload/:path*",
    "/api/reset",
    "/api/pipeline/:path*",
    // Exclude public routes
    "/((?!api/auth|api/health|api/webhooks|api/cron|_next|login).*)",
  ],
};
```

**Alternative: Per-Route Validation**:

```typescript
// src/lib/api-auth.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAuth(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireRole(request: Request, roles: string[]) {
  const session = await requireAuth(request);
  if (session instanceof Response) return session;

  if (!roles.includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
```

**Implementation Checklist**:

- [x] Create `middleware.ts` with route matcher
- [x] Add `requireAuth()` helper for API routes
- [x] Protect `/api/suppliers/*` endpoints
- [x] Protect `/api/batches/*` endpoints
- [x] Protect `/api/upload/*` endpoints
- [x] Protect `/api/reset` endpoint (ADMIN only)
- [x] Protect `/api/pipeline/*` endpoints
- [x] Keep `/api/webhooks/*` protected by API key (not session)
- [x] Keep `/api/cron/*` protected by CRON_SECRET
- [x] Keep `/api/health` public

---

### 10.2 Google OAuth Integration

**Priority**: HIGH

Add Google as authentication provider for enterprise SSO.

**Google Cloud Console Setup**:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Application type: Web application
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://henkel-po-caller-production.up.railway.app/api/auth/callback/google` (prod)

**Environment Variables**:

```bash
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
```

**NextAuth Configuration** (`src/lib/auth.ts`):

```typescript
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    // Existing Credentials provider...
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          // Restrict to specific domain (optional)
          hd: "henkel.com", // Only allow @henkel.com emails
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // Auto-create user if doesn't exist
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name || "Google User",
              passwordHash: "", // No password for OAuth users
              role: "OPERATOR", // Default role
            },
          });
        }
      }
      return true;
    },
    // ... existing callbacks
  },
};
```

**Login Page Updates** (`src/app/login/page.tsx`):

```typescript
// Add Google sign-in button
<button
  onClick={() => signIn("google", { callbackUrl: "/" })}
  className="flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-3"
>
  <GoogleIcon className="h-5 w-5" />
  Continue with Google
</button>

<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-sm">
    <span className="bg-bg-surface px-2 text-fg-muted">or</span>
  </div>
</div>

{/* Existing email/password form */}
```

**Implementation Checklist**:

- [ ] Create Google OAuth credentials in Google Cloud Console
- [ ] Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to env
- [ ] Install/configure GoogleProvider in auth.ts
- [ ] Add auto-create user logic for Google sign-ins
- [ ] Update login page with Google button
- [ ] Add Google icon component
- [ ] Test OAuth flow end-to-end
- [ ] Configure domain restriction (optional: `hd: "henkel.com"`)
- [ ] Add Railway environment variables

---

### 10.3 Forgot Password / Password Reset

**Priority**: HIGH

Allow users to reset their password via email link.

**Database Schema** (add to `prisma/schema.prisma`):

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([email])
  @@index([token])
  @@map("password_reset_tokens")
}
```

**API Endpoints**:

**1. Request Reset** (`POST /api/auth/forgot-password`):

```typescript
// Input: { email: string }
// 1. Find user by email
// 2. Generate secure token (crypto.randomUUID())
// 3. Store token with 1-hour expiry
// 4. Send reset email with link
// 5. Return success (don't reveal if user exists)

export async function POST(request: Request) {
  const { email } = await request.json();

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user) {
    return Response.json({ success: true });
  }

  // Delete any existing tokens for this email
  await prisma.passwordResetToken.deleteMany({ where: { email } });

  // Create new token
  const token = crypto.randomUUID();
  await prisma.passwordResetToken.create({
    data: {
      email,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  // Send email
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your Henkel password",
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`,
  });

  return Response.json({ success: true });
}
```

**2. Reset Password** (`POST /api/auth/reset-password`):

```typescript
// Input: { token: string, password: string }
// 1. Find valid token (not expired)
// 2. Validate password strength
// 3. Hash new password
// 4. Update user
// 5. Delete token
// 6. Return success

export async function POST(request: Request) {
  const { token, password } = await request.json();

  // Validate password strength
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const hashedPassword = await hash(password, 10);

  await prisma.user.update({
    where: { email: resetToken.email },
    data: { passwordHash: hashedPassword },
  });

  await prisma.passwordResetToken.delete({ where: { token } });

  return Response.json({ success: true });
}
```

**Email Service** (`src/lib/email.ts`):

```typescript
// Using Resend (recommended) or SendGrid
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, html }: EmailOptions) {
  await resend.emails.send({
    from: "Henkel <noreply@henkel.com>",
    to,
    subject,
    html,
  });
}
```

**UI Pages**:

- `/forgot-password` - Email input form
- `/reset-password` - New password form (with token from URL)

**Implementation Checklist**:

- [ ] Add `PasswordResetToken` model to schema
- [ ] Run Prisma migration
- [ ] Create `POST /api/auth/forgot-password` endpoint
- [ ] Create `POST /api/auth/reset-password` endpoint
- [ ] Set up email service (Resend recommended)
- [ ] Add `RESEND_API_KEY` to environment
- [ ] Create `/forgot-password` page
- [ ] Create `/reset-password` page
- [ ] Add "Forgot password?" link to login page
- [ ] Test full reset flow
- [ ] Add rate limiting to prevent abuse

---

### 10.4 Rate Limiting

**Priority**: MEDIUM

Protect authentication endpoints from brute force attacks.

**Options**:

1. **Upstash Rate Limit** (recommended for Railway):

   ```typescript
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";

   const ratelimit = new Ratelimit({
     redis: Redis.fromEnv(),
     limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 requests per minute
   });
   ```

2. **In-memory (simple, for single instance)**:
   ```typescript
   // Track failed attempts per IP/email
   const attempts = new Map<string, { count: number; resetAt: number }>();
   ```

**Apply To**:

- `/api/auth/callback/credentials` (login)
- `/api/auth/forgot-password` (reset request)
- `/api/auth/reset-password` (reset execution)

**Implementation Checklist**:

- [ ] Install `@upstash/ratelimit` (or use existing Redis)
- [ ] Create rate limit middleware
- [ ] Apply to login endpoint (5 attempts/minute)
- [ ] Apply to forgot-password (3 attempts/hour)
- [ ] Return appropriate error messages
- [ ] Log rate limit violations

---

### 10.5 Role-Based Access Control (RBAC)

**Priority**: MEDIUM

Enforce roles for sensitive operations.

**Role Definitions**:

| Role     | Permissions                                 |
| -------- | ------------------------------------------- |
| ADMIN    | All operations, reset demo, manage users    |
| OPERATOR | View data, trigger calls, resolve conflicts |

**Protected Operations**:

| Endpoint/Action          | Required Role |
| ------------------------ | ------------- |
| `POST /api/reset`        | ADMIN         |
| User management (future) | ADMIN         |
| Settings changes         | ADMIN         |
| View/manage batches      | OPERATOR+     |
| Trigger calls            | OPERATOR+     |

**Implementation**:

```typescript
// src/lib/api-auth.ts
export async function requireAdmin(request: Request) {
  return requireRole(request, ["ADMIN"]);
}

// Usage in route:
export async function POST(request: Request) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof Response) return authResult;

  // ... admin-only logic
}
```

**Implementation Checklist**:

- [ ] Create `requireAdmin()` helper
- [ ] Create `requireOperator()` helper
- [ ] Protect `/api/reset` with ADMIN role
- [ ] Add role indicator in UI header
- [ ] Hide admin-only UI elements for operators

---

### 10.6 Security Audit Logging

**Priority**: LOW

Track authentication events for security monitoring.

**Events to Log**:

- Login success/failure (with IP, user agent)
- Password reset requested
- Password changed
- Role changes
- Suspicious activity (rate limit hits)

**Schema Addition**:

```prisma
model SecurityLog {
  id        String   @id @default(cuid())
  event     String   // LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_RESET, etc.
  userId    String?
  email     String?
  ipAddress String?
  userAgent String?
  details   Json?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([event])
  @@index([createdAt])
  @@map("security_logs")
}
```

**Implementation Checklist**:

- [ ] Add `SecurityLog` model
- [ ] Create `logSecurityEvent()` helper
- [ ] Log on successful login
- [ ] Log on failed login
- [ ] Log on password reset
- [ ] Add admin view for security logs (future)

---

### 10.7 Additional Security Measures

**Password Strength Validation**:

```typescript
// src/lib/validators.ts
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number")
  .regex(/[^A-Za-z0-9]/, "Password must contain special character");
```

**Session Configuration**:

```typescript
// src/lib/auth.ts
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60, // Match session
  },
  // ...
};
```

**HTTPS Enforcement**:

- Railway automatically provides HTTPS
- Add `Strict-Transport-Security` header in production

**Implementation Checklist**:

- [ ] Add password strength validation to registration/reset
- [ ] Configure session expiry (24 hours recommended)
- [ ] Remove demo credentials hint from login page (production)
- [ ] Add security headers (CSP, HSTS, etc.)
- [ ] Review and rotate secrets before production

---

### 10.8 Files Summary

| File                                        | Purpose                         | Status |
| ------------------------------------------- | ------------------------------- | ------ |
| `middleware.ts`                             | Route protection middleware     | [x]    |
| `src/lib/api-auth.ts`                       | Auth helpers for API routes     | [x]    |
| `src/lib/auth.ts`                           | Add Google provider             | [ ]    |
| `src/lib/email.ts`                          | Email service (Resend)          | [ ]    |
| `src/app/api/auth/forgot-password/route.ts` | Request password reset          | [ ]    |
| `src/app/api/auth/reset-password/route.ts`  | Execute password reset          | [ ]    |
| `src/app/forgot-password/page.tsx`          | Forgot password UI              | [ ]    |
| `src/app/reset-password/page.tsx`           | Reset password UI               | [ ]    |
| `src/app/login/page.tsx`                    | Add Google button, forgot link  | [ ]    |
| `prisma/schema.prisma`                      | PasswordResetToken, SecurityLog | [ ]    |

---

### 10.9 Environment Variables (New)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>

# Email Service (Resend)
RESEND_API_KEY=<from-resend-dashboard>

# Rate Limiting (if using Upstash separately)
UPSTASH_REDIS_REST_URL=<optional-if-using-separate-upstash>
UPSTASH_REDIS_REST_TOKEN=<optional>
```

---

## Phase 11: Polish & Production

**Goal**: Production-ready deployment.

### 10.1 Error Handling

- [ ] Structured error responses
- [ ] Retry with exponential backoff
- [ ] Graceful degradation

### 10.2 Logging

- [ ] Add logging throughout
- [ ] Track key metrics
- [ ] Railway logs integration

### 10.3 Performance

- [ ] Database query optimization
- [ ] Redis connection pooling
- [ ] API response caching where appropriate

### 10.4 Security

- [ ] Validate all inputs
- [ ] Rate limiting on upload APIs
- [ ] Webhook signature verification

### 10.5 Documentation

- [ ] API documentation
- [ ] Deployment guide
- [ ] Configuration reference

### 10.6 Final Deployment

- [ ] Production environment variables
- [ ] Database migrations
- [ ] Smoke tests
- [ ] Monitor for issues

---

## Railway Setup Checklist

### Services Created

1. **PostgreSQL** - `henkel-po-caller-db` [DONE]
2. **Redis** - `henkel-po-caller-redis` [DONE]
3. **App** - `henkel-po-caller-app` [DONE]

### Environment Variables

```
DATABASE_URL=postgresql://...          [CONFIGURED]
REDIS_URL=redis://...                  [CONFIGURED]
NEXTAUTH_SECRET=<generated>            [CONFIGURED]
NEXTAUTH_URL=https://henkel-po-caller-production.up.railway.app
APP_URL=https://henkel-po-caller-production.up.railway.app
HAPPYROBOT_WEBHOOK_CANCEL_URL=<from HR dashboard>
HAPPYROBOT_WEBHOOK_RESCHEDULE_URL=<from HR dashboard>
HAPPYROBOT_API_KEY=<from HR dashboard>
HAPPYROBOT_ORG_ID=<from HR dashboard>
CRON_SECRET=<generated>                [CONFIGURED]
QUEUE_POLL_INTERVAL_MS=5000
MAX_CONCURRENT_CALLS=5
```

### Cron Jobs (Railway)

- `*/1 * * * *` - `/api/cron/process-queue`
- `*/5 * * * *` - `/api/cron/process-callbacks`

---

## Verification Strategy

### Per-Phase Testing

1. **Phase 0**: Health endpoint, DB/Redis connectivity [DONE]
2. **Phase 1**: Data model - Prisma generate, DB tables exist [DONE]
3. **Phase 2**: Excel parser - Unit tests with sample files [DONE]
4. **Phase 3**: Upload API - curl/Postman tests, verify batches in Redis [DONE]
5. **Phase 4**: Upload UI - Manual UI testing
6. **Phase 5**: Query APIs - Verify data retrieval, queue ordering
7. **Phase 6**: HappyRobot - Mock calls, webhook simulation
8. **Phase 7**: Retry logic - Callback scheduling
9. **Phase 8**: Dashboard UI - Full walkthrough
10. **Phase 9**: Production - End-to-end integration test

### Sample Test Data

Use the Excel files in `docs/`:

- `Open POs as of 010626.xlsx` - Full superset (8,979 rows, 178 suppliers, $140M)
- `Open POs as of 010626 - Cancel Messages.xlsx` - Cancellations only (521 rows, 81 suppliers, $7.3M)

---

## Critical Files Summary

### New Files Created

- `src/lib/excel-parser.ts` - Excel file parsing [DONE]
- `src/lib/classification.ts` - PO action classification [DONE]
- `src/lib/batching.ts` - Supplier batch grouping [DONE]
- `src/lib/queue.ts` - Redis queue operations [DONE]
- `src/lib/upload-job.ts` - Async upload job tracking [DONE]
- `src/app/api/upload/pos/route.ts` - Excel upload endpoint [DONE]
- `src/app/api/upload/progress/[jobId]/route.ts` - SSE progress endpoint [DONE]
- `src/components/upload/*` - Upload FAB and modal [DONE]
- `src/components/pipeline/*` - Sankey pipeline visualization [DONE]
- `src/components/pipeline/empty-pipeline-state.tsx` - Empty state with upload progress [DONE]
- `src/stores/ui-store.ts` - UI state (uploads, modals) [DONE]
- `src/app/api/reset/route.ts` - Demo reset endpoint [DONE]
- `scripts/clear-data.ts` - Dev utility to clear DB/Redis [DONE]

### Files To Create

- `src/lib/queue-processor.ts` - Queue consumption [DONE - Phase 6]
- `src/lib/retry-scheduler.ts` - Smart retry timing (Phase 7)
- `src/app/api/cron/process-queue/route.ts` - Queue cron job [DONE - Phase 6]
- `src/app/api/cron/process-callbacks/route.ts` - Callback cron job (Phase 7)

### Query API Files (Phase 5) [DONE]

- `src/app/api/batches/stats/route.ts` - Dashboard stats
- `src/app/api/batches/route.ts` - Batch list by status
- `src/app/api/batches/[id]/route.ts` - Batch details with POs
- `src/app/api/suppliers/route.ts` - Supplier list with stats
- `src/app/api/suppliers/[id]/route.ts` - Supplier detail with batches

### UI Pages

- `src/app/(app)/dashboard/page.tsx` - KPIs + Pipeline visualization [DONE]
- `src/app/(app)/suppliers/page.tsx` - Supplier list
- `src/app/(app)/suppliers/[id]/page.tsx` - Supplier detail with batches/POs
- `src/app/(app)/settings/page.tsx` - System config

### Files to Adapt

- `src/lib/call-provider.ts` - Batch call abstraction [DONE]
- `src/lib/providers/happyrobot.ts` - Batch-based call payloads [DONE]
- `src/app/api/webhooks/happyrobot/route.ts` - Batch webhook handling [DONE]
- `src/lib/redis.ts` - Added pipeline/batch channels [DONE]
- `src/lib/prisma.ts` - Keep as-is
- Auth files - Keep as-is
