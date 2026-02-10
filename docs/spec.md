# Henkel PO Caller - Technical Specification

> AI-powered voice agent system for automating Purchase Order cancellations and reschedules with suppliers.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [API Design](#api-design)
5. [Classification Logic](#classification-logic)
6. [Queue Management](#queue-management)
7. [HappyRobot Integration](#happyrobot-integration)
8. [Retry & Callback Logic](#retry--callback-logic)
9. [Dashboard UI](#dashboard-ui)
10. [Configuration](#configuration)
11. [Database Schema](#database-schema)
12. [Implementation Phases](#implementation-phases)

---

## Overview

### Purpose

Henkel PO Caller automates supplier communication for Purchase Order lifecycle management. When Henkel's internal systems identify POs that need action (cancellation, expedite, or push-out), this system:

1. Receives PO data via API
2. Classifies each PO by required action
3. Groups POs by supplier for efficient calling
4. Triggers HappyRobot AI voice agents to contact suppliers
5. Handles retries, callbacks, and escalations
6. Provides a dashboard for monitoring and reporting

### Key Terminology

| Term                    | Definition                                            |
| ----------------------- | ----------------------------------------------------- |
| **PO (Purchase Order)** | A line item order from Henkel to a supplier           |
| **Cancellation**        | Request to cancel a PO entirely                       |
| **Expedite**            | Request to deliver earlier than original due date     |
| **Push Out**            | Request to delay delivery to a later date             |
| **Supplier Batch**      | A group of POs for the same supplier, called together |
| **Action Item**         | Generic term for any PO requiring supplier contact    |

### Technology Stack

| Component   | Technology              |
| ----------- | ----------------------- |
| Framework   | Next.js 14 (App Router) |
| Language    | TypeScript              |
| Database    | PostgreSQL (Prisma ORM) |
| Queue       | Redis (ioredis)         |
| Voice Agent | HappyRobot AI           |
| Hosting     | Railway                 |
| Auth        | NextAuth.js             |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              HENKEL PO CALLER                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐     ┌─────────────────────────────────────────────────────┐   │
│  │   External   │     │                   UPLOAD LAYER                      │   │
│  │              │     │  ┌─────────────────────┐  ┌─────────────────────┐   │   │
│  │ Henkel API  │────▶│  │ upload_cancellations│  │ upload_reschedules  │   │   │
│  │  (POST /api) │     │  │                     │  │ (expedite/push-out) │   │   │
│  │              │     │  └──────────┬──────────┘  └──────────┬──────────┘   │   │
│  └──────────────┘     │             │                        │              │   │
│                       └─────────────┼────────────────────────┼──────────────┘   │
│                                     │                        │                   │
│                                     ▼                        ▼                   │
│                       ┌─────────────────────────────────────────────────────┐   │
│                       │                   QUEUE LAYER                       │   │
│                       │  ┌─────────────────────┐  ┌─────────────────────┐   │   │
│                       │  │ queue_cancellations │  │  queue_reschedules  │   │   │
│                       │  │  (Redis sorted set) │  │  (Redis sorted set) │   │   │
│                       │  └──────────┬──────────┘  └──────────┬──────────┘   │   │
│                       │             │                        │              │   │
│                       └─────────────┼────────────────────────┼──────────────┘   │
│                                     │                        │                   │
│                                     ▼                        ▼                   │
│                       ┌─────────────────────────────────────────────────────┐   │
│                       │               HAPPYROBOT LAYER                      │   │
│                       │  ┌─────────────────────┐  ┌─────────────────────┐   │   │
│                       │  │Workfl_cancellations │  │Workflow_rescheduling│   │   │
│                       │  │                     │  │                     │   │   │
│                       │  └──────────┬──────────┘  └──────────┬──────────┘   │   │
│                       │             │                        │              │   │
│                       │             └────────┬───────────────┘              │   │
│                       │                      │                              │   │
│                       └──────────────────────┼──────────────────────────────┘   │
│                                              │                                   │
│                                              ▼                                   │
│                       ┌─────────────────────────────────────────────────────┐   │
│                       │              CALLBACK HANDLER                       │   │
│                       │  • Process HappyRobot webhooks                      │   │
│                       │  • Update PO/Batch status                           │   │
│                       │  • Re-queue for retry if needed                     │   │
│                       │  • Update dashboard                                 │   │
│                       └─────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. Upload Layer

- Receives PO data from Henkel API
- Validates and transforms incoming data
- Classifies POs by action type
- Detects and flags conflicts for human review
- Groups POs by supplier
- Enqueues SupplierBatches to appropriate queues

#### 2. Queue Layer

- Redis-based priority queues (sorted sets)
- Priority by total batch value (higher value = higher priority)
- Separate queues for cancellations and reschedules
- Supports batch processing and rate limiting

#### 3. HappyRobot Layer

- Triggers voice agent workflows
- Passes full PO details to voice agent
- Receives real-time status via webhooks
- Handles different workflow types (cancel vs. reschedule)

#### 4. Callback Handler

- Processes HappyRobot webhook events
- Determines if retry is needed based on outcome
- Schedules callbacks with smart timing
- Updates all statuses and triggers dashboard refresh

---

## Data Model

### Entity Relationship

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Supplier   │───┐   │  SupplierBatch   │───┐   │ PurchaseOrder   │
│             │   │   │                  │   │   │                 │
│ • id        │   │   │ • id             │   │   │ • id            │
│ • name      │   │   │ • supplierId     │◀──┘   │ • batchId       │◀──┐
│ • number    │◀──┘   │ • status         │       │ • actionType    │   │
│ • phone     │       │ • actionTypes[]  │       │ • poNumber      │   │
│ • facility  │       │ • totalValue     │       │ • dueDate       │   │
│             │       │ • priority       │       │ • recommendedDate│   │
└─────────────┘       │ • attemptCount   │       │ • status        │   │
                      │ • scheduledFor   │       │ • value         │   │
                      │ • happyRobotRunId│       │ • ...           │   │
                      └──────────────────┘       └─────────────────┘   │
                                                                       │
                      ┌──────────────────┐                            │
                      │    AgentRun      │────────────────────────────┘
                      │                  │
                      │ • id             │
                      │ • batchId        │
                      │ • status         │
                      │ • outcome        │
                      │ • externalUrl    │
                      │ • scheduledFor   │
                      │ • ...            │
                      └──────────────────┘
```

### Core Entities

#### Supplier

Represents a vendor Henkel orders from.

| Field          | Type     | Description                              |
| -------------- | -------- | ---------------------------------------- |
| id             | String   | Unique identifier (CUID)                 |
| supplierNumber | String   | Henkel's supplier number (e.g., "80150") |
| name           | String   | Supplier company name                    |
| phone          | String   | Primary phone number for calls           |
| facility       | String?  | Associated facility code                 |
| isActive       | Boolean  | Whether supplier is active               |
| createdAt      | DateTime | Record creation timestamp                |
| updatedAt      | DateTime | Last update timestamp                    |

#### PurchaseOrder

A single PO line item requiring action.

| Field                | Type      | Description                                               |
| -------------------- | --------- | --------------------------------------------------------- |
| id                   | String    | Unique identifier (CUID)                                  |
| externalId           | String?   | Composite key: `{PO#}-{POLine}`                           |
| supplierId           | String    | FK to Supplier                                            |
| batchId              | String?   | FK to SupplierBatch (assigned during grouping)            |
| actionType           | Enum      | CANCEL, EXPEDITE, PUSH_OUT                                |
| status               | Enum      | PENDING, QUEUED, IN_PROGRESS, COMPLETED, FAILED, CONFLICT |
| poNumber             | String    | PO number from Henkel                                     |
| poLine               | Int       | PO line number                                            |
| partNumber           | String    | Part identifier                                           |
| description          | String?   | Part description                                          |
| quantityOrdered      | Decimal   | Original quantity                                         |
| quantityReceived     | Decimal   | Already received                                          |
| quantityBalance      | Decimal   | Remaining to receive                                      |
| dueDate              | DateTime  | Original due date                                         |
| recommendedDate      | DateTime? | New recommended date (for reschedules)                    |
| expectedUnitCost     | Decimal   | Unit cost                                                 |
| calculatedTotalValue | Decimal   | Total value of line                                       |
| buyer                | String?   | Buyer code                                                |
| facility             | String    | Facility code                                             |
| warehouseId          | String?   | Warehouse identifier                                      |
| poEntryDate          | DateTime? | When PO was created                                       |
| dispositionStatus    | String?   | Any special status                                        |
| rawData              | Json      | Original payload for reference                            |
| createdAt            | DateTime  | Record creation                                           |
| updatedAt            | DateTime  | Last update                                               |

#### SupplierBatch

Groups POs for the same supplier into a single call.

| Field             | Type      | Description                                              |
| ----------------- | --------- | -------------------------------------------------------- |
| id                | String    | Unique identifier (CUID)                                 |
| supplierId        | String    | FK to Supplier                                           |
| status            | Enum      | PENDING, QUEUED, IN_PROGRESS, COMPLETED, FAILED, PARTIAL |
| actionTypes       | String[]  | Actions in this batch (CANCEL, EXPEDITE, PUSH_OUT)       |
| totalValue        | Decimal   | Sum of all PO values (for priority)                      |
| poCount           | Int       | Number of POs in batch                                   |
| priority          | Int       | Calculated priority score                                |
| attemptCount      | Int       | Number of call attempts                                  |
| maxAttempts       | Int       | Maximum retry attempts (default: 5)                      |
| scheduledFor      | DateTime? | Next scheduled call time                                 |
| happyRobotRunId   | String?   | Current HappyRobot run ID                                |
| lastOutcome       | String?   | Last call outcome                                        |
| lastOutcomeReason | String?   | Details of last outcome                                  |
| createdAt         | DateTime  | Record creation                                          |
| updatedAt         | DateTime  | Last update                                              |
| completedAt       | DateTime? | When all POs resolved                                    |

#### AgentRun

Tracks each HappyRobot call attempt.

| Field         | Type      | Description                                                   |
| ------------- | --------- | ------------------------------------------------------------- |
| id            | String    | Unique identifier (CUID)                                      |
| batchId       | String    | FK to SupplierBatch                                           |
| externalId    | String?   | HappyRobot run_id                                             |
| status        | Enum      | PENDING, SCHEDULED, IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER |
| outcome       | String?   | Call outcome code                                             |
| outcomeReason | String?   | Additional context                                            |
| externalUrl   | String?   | Link to HappyRobot platform                                   |
| scheduledFor  | DateTime? | When call is scheduled                                        |
| startedAt     | DateTime? | Call start time                                               |
| endedAt       | DateTime? | Call end time                                                 |
| duration      | Int?      | Call duration in seconds                                      |
| attempt       | Int       | Attempt number (1-5)                                          |
| metadata      | Json?     | Additional call data                                          |
| createdAt     | DateTime  | Record creation                                               |
| updatedAt     | DateTime  | Last update                                                   |

#### ConflictQueue

POs flagged for human review.

| Field           | Type      | Description               |
| --------------- | --------- | ------------------------- |
| id              | String    | Unique identifier         |
| purchaseOrderId | String    | FK to PurchaseOrder       |
| conflictType    | String    | Type of conflict detected |
| conflictDetails | Json      | Details for resolution    |
| resolvedAt      | DateTime? | When resolved             |
| resolvedBy      | String?   | User who resolved         |
| resolution      | String?   | How it was resolved       |
| createdAt       | DateTime  | Record creation           |

---

## API Design

### Upload Endpoints

#### POST /api/upload/cancellations

Receives PO data identified for cancellation.

**Request Body:**

```typescript
interface CancellationUploadPayload {
  pos: Array<{
    poNumber: string;
    poLine: number;
    supplierNumber: string;
    supplierName: string;
    supplierPhone: string; // REQUIRED
    partNumber: string;
    description?: string;
    quantityOrdered: number;
    quantityReceived: number;
    quantityBalance: number;
    dueDate: string; // ISO date
    expectedUnitCost: number;
    calculatedTotalValue: number;
    buyer?: string;
    facility: string;
    warehouseId?: string;
    poEntryDate?: string;
    dispositionStatus?: string;
  }>;
  metadata?: {
    uploadSource?: string; // "api", "manual", "batch"
    uploadedBy?: string;
    batchId?: string;
  };
}
```

**Response:**

```typescript
interface UploadResponse {
  success: boolean;
  data: {
    received: number; // Total POs received
    queued: number; // POs queued for processing
    conflicts: number; // POs flagged for review
    invalid: number; // POs rejected (validation failed)
    batchesCreated: number; // Supplier batches created
  };
  conflicts?: Array<{
    poNumber: string;
    poLine: number;
    reason: string;
  }>;
  errors?: Array<{
    poNumber: string;
    poLine: number;
    error: string;
  }>;
}
```

#### POST /api/upload/reschedules

Receives PO data requiring date changes (expedite or push-out).

**Request Body:**

```typescript
interface RescheduleUploadPayload {
  pos: Array<{
    poNumber: string;
    poLine: number;
    supplierNumber: string;
    supplierName: string;
    supplierPhone: string; // REQUIRED
    partNumber: string;
    description?: string;
    quantityOrdered: number;
    quantityReceived: number;
    quantityBalance: number;
    dueDate: string; // ISO date
    recommendedDate: string; // ISO date - NEW date
    expectedUnitCost: number;
    calculatedTotalValue: number;
    buyer?: string;
    facility: string;
    warehouseId?: string;
    poEntryDate?: string;
    dispositionStatus?: string;
  }>;
  metadata?: {
    uploadSource?: string;
    uploadedBy?: string;
    batchId?: string;
  };
}
```

### Status Endpoints

#### GET /api/batches

List all supplier batches with filters.

**Query Parameters:**

- `status`: Filter by status (PENDING, QUEUED, IN_PROGRESS, COMPLETED, FAILED)
- `supplierId`: Filter by supplier
- `actionType`: Filter by action type
- `limit`: Pagination limit (default: 50)
- `offset`: Pagination offset

#### GET /api/batches/:id

Get detailed batch information including all POs.

#### GET /api/pos

List all purchase orders with filters.

#### GET /api/pos/:id

Get single PO details.

#### GET /api/suppliers

List all suppliers.

#### GET /api/suppliers/:id

Get supplier details with all batches and POs.

#### GET /api/conflicts

List POs flagged for human review.

#### POST /api/conflicts/:id/resolve

Resolve a conflict manually.

### Dashboard Endpoints

#### GET /api/dashboard/stats

Aggregate statistics for dashboard.

```typescript
interface DashboardStats {
  queues: {
    cancellations: {
      pending: number;
      inProgress: number;
      completed: number;
      failed: number;
    };
    reschedules: {
      pending: number;
      inProgress: number;
      completed: number;
      failed: number;
    };
  };
  today: {
    callsAttempted: number;
    callsSuccessful: number;
    callsFailed: number;
    posProcessed: number;
  };
  failures: {
    requiresReview: number;
    maxRetriesExhausted: number;
  };
}
```

### Webhook Endpoints

#### POST /api/webhooks/happyrobot

Receives callbacks from HappyRobot.

---

## Classification Logic

### Decision Tree

```
┌─────────────────────────────────────────┐
│           Incoming PO Data              │
└────────────────────┬────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Is PO in Cancel List? │
         │   (or cancel flag)    │
         └───────────┬───────────┘
                     │
            ┌────────┴────────┐
            │ YES             │ NO
            ▼                 ▼
    ┌───────────────┐  ┌─────────────────────────┐
    │ ACTION_TYPE = │  │ Does Recommended Date   │
    │ CANCEL        │  │ exist and differ from   │
    └───────────────┘  │ Due Date?               │
                       └───────────┬─────────────┘
                                   │
                       ┌───────────┴───────────┐
                       │ YES                   │ NO
                       ▼                       ▼
           ┌─────────────────────┐    ┌───────────────┐
           │ Recommended < Due?  │    │ NO_ACTION     │
           └──────────┬──────────┘    │ (skip)        │
                      │               └───────────────┘
              ┌───────┴───────┐
              │ YES           │ NO
              ▼               ▼
      ┌───────────────┐ ┌───────────────┐
      │ ACTION_TYPE = │ │ ACTION_TYPE = │
      │ EXPEDITE      │ │ PUSH_OUT      │
      └───────────────┘ └───────────────┘
```

### Classification Rules

```typescript
function classifyPO(po: IncomingPO, isInCancelList: boolean): ActionType | null {
  // Rule 1: Explicit cancellation
  if (isInCancelList || po.cancelFlag === true) {
    return "CANCEL";
  }

  // Rule 2: No recommended date = no reschedule needed
  if (!po.recommendedDate) {
    return null; // No action required
  }

  const dueDate = new Date(po.dueDate);
  const recommendedDate = new Date(po.recommendedDate);

  // Rule 3: Same date = no action
  if (dueDate.getTime() === recommendedDate.getTime()) {
    return null;
  }

  // Rule 4: Recommended earlier = Expedite
  if (recommendedDate < dueDate) {
    return "EXPEDITE";
  }

  // Rule 5: Recommended later = Push Out
  return "PUSH_OUT";
}
```

### Conflict Detection

A PO is flagged as CONFLICT when:

1. **Duplicate Action**: Same PO# + Line already exists with different action type
2. **Cancel + Reschedule**: PO appears in both cancel list AND has recommended date
3. **Invalid Data**: Missing required fields after transformation

```typescript
function detectConflict(po: PurchaseOrder, existingPO?: PurchaseOrder): ConflictType | null {
  if (!existingPO) return null;

  // Same PO with different action
  if (existingPO.actionType !== po.actionType) {
    return {
      type: "DUPLICATE_DIFFERENT_ACTION",
      details: {
        existing: existingPO.actionType,
        incoming: po.actionType,
      },
    };
  }

  return null;
}
```

---

## Queue Management

### Queue Structure

Using Redis sorted sets for priority queues:

```
queue:cancellations  -> Sorted set (score = priority, value = batchId)
queue:reschedules    -> Sorted set (score = priority, value = batchId)
queue:callbacks      -> Sorted set (score = scheduledTime, value = batchId)
```

### Priority Calculation

Priority is based on **total batch value** (higher value = higher priority):

```typescript
function calculatePriority(batch: SupplierBatch): number {
  // Higher value = higher priority (lower score in sorted set)
  // Using negative value so ZRANGEBYSCORE returns highest value first
  return -batch.totalValue;
}
```

### Batch Size Limits

Configurable maximum POs per batch (per call):

```typescript
const BATCH_CONFIG = {
  maxPOsPerBatch: 10, // Default, configurable
  maxValuePerBatch: 100000, // Optional value cap
};
```

If a supplier has more POs than the limit, multiple batches are created.

### Queue Operations

```typescript
// Enqueue a batch
async function enqueueBatch(batch: SupplierBatch): Promise<void> {
  const queue = batch.actionTypes.includes("CANCEL") ? "queue:cancellations" : "queue:reschedules";

  const priority = calculatePriority(batch);
  await redis.zadd(queue, priority, batch.id);

  await prisma.supplierBatch.update({
    where: { id: batch.id },
    data: { status: "QUEUED" },
  });
}

// Dequeue next batch for processing
async function dequeueBatch(queueName: string): Promise<string | null> {
  const result = await redis.zpopmin(queueName);
  return result?.[0] || null;
}

// Schedule callback
async function scheduleCallback(batchId: string, scheduledFor: Date): Promise<void> {
  await redis.zadd("queue:callbacks", scheduledFor.getTime(), batchId);
}
```

### Mixed Action Batching

When a supplier has both cancellations and reschedules:

- **All actions are combined into a single call**
- The voice agent handles mixed action types
- Batch `actionTypes` array contains all action types present
- Queue placement: If any cancellations exist, use cancellation queue (priority)

---

## HappyRobot Integration

### Workflow Triggering

```typescript
interface HappyRobotPayload {
  callback_url: string;
  supplier: {
    name: string;
    number: string;
    phone: string;
  };
  pos: Array<{
    poNumber: string;
    poLine: number;
    actionType: "CANCEL" | "EXPEDITE" | "PUSH_OUT";
    partNumber: string;
    description: string;
    quantityBalance: number;
    currentDueDate: string;
    newDate?: string; // For reschedules
    value: number;
  }>;
  batchId: string;
  attemptNumber: number;
  context?: {
    previousOutcome?: string;
    previousReason?: string;
  };
}

async function triggerHappyRobotCall(batch: SupplierBatch): Promise<string[]> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: batch.supplierId },
  });

  const pos = await prisma.purchaseOrder.findMany({
    where: { batchId: batch.id },
  });

  const payload: HappyRobotPayload = {
    callback_url: `${process.env.APP_URL}/api/webhooks/happyrobot`,
    supplier: {
      name: supplier.name,
      number: supplier.supplierNumber,
      phone: supplier.phone,
    },
    pos: pos.map((po) => ({
      poNumber: po.poNumber,
      poLine: po.poLine,
      actionType: po.actionType,
      partNumber: po.partNumber,
      description: po.description || "",
      quantityBalance: po.quantityBalance,
      currentDueDate: po.dueDate.toISOString(),
      newDate: po.recommendedDate?.toISOString(),
      value: po.calculatedTotalValue,
    })),
    batchId: batch.id,
    attemptNumber: batch.attemptCount + 1,
    context: batch.lastOutcome
      ? {
          previousOutcome: batch.lastOutcome,
          previousReason: batch.lastOutcomeReason,
        }
      : undefined,
  };

  // Determine workflow based on action types
  const webhookUrl = batch.actionTypes.includes("CANCEL")
    ? process.env.HAPPYROBOT_WEBHOOK_CANCEL_URL
    : process.env.HAPPYROBOT_WEBHOOK_RESCHEDULE_URL;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result.queued_run_ids;
}
```

### Webhook Handler

```typescript
interface HappyRobotWebhook {
  run_id: string;
  event_type: "started" | "completed" | "failed" | "log";
  timestamp: string;
  data: {
    status?: string;
    outcome?: string;
    outcomeReason?: string;
    callbackRequested?: boolean;
    callbackReason?: string;
    poResults?: Array<{
      poNumber: string;
      poLine: number;
      confirmed: boolean;
      notes?: string;
    }>;
    duration?: number;
  };
}

async function handleHappyRobotWebhook(webhook: HappyRobotWebhook): Promise<void> {
  const agentRun = await prisma.agentRun.findUnique({
    where: { externalId: webhook.run_id },
    include: { batch: true },
  });

  if (!agentRun) {
    console.warn(`Unknown run_id: ${webhook.run_id}`);
    return;
  }

  switch (webhook.event_type) {
    case "started":
      await handleCallStarted(agentRun, webhook);
      break;
    case "completed":
      await handleCallCompleted(agentRun, webhook);
      break;
    case "failed":
      await handleCallFailed(agentRun, webhook);
      break;
    case "log":
      await handleCallLog(agentRun, webhook);
      break;
  }
}
```

### Success Criteria (Defined in HappyRobot Workflow)

The HappyRobot workflow determines success based on:

- **Cancellations**: Supplier confirms they will cancel the PO(s)
- **Expedites**: Supplier confirms new earlier date
- **Push-outs**: Supplier confirms new later date

Success criteria are workflow-defined and communicated via webhook `outcome` field.

---

## Retry & Callback Logic

### Retry Triggers

A callback/retry is scheduled when:

| Outcome              | Retry? | Reason                                    |
| -------------------- | ------ | ----------------------------------------- |
| `no_answer`          | Yes    | No one picked up                          |
| `voicemail`          | Yes    | Went to voicemail                         |
| `callback_requested` | Yes    | Person asked to call back                 |
| `busy`               | Yes    | Line was busy                             |
| `not_available`      | Yes    | Contact not available                     |
| `partial_success`    | Yes    | Some POs confirmed, others need follow-up |
| `success`            | No     | All POs confirmed                         |
| `rejected`           | No     | Supplier explicitly refused               |
| `wrong_number`       | No     | Phone number is incorrect (escalate)      |

### Smart Retry Timing (Business Hours Rotation)

```typescript
interface RetrySchedule {
  attempt: number;
  delayHours: number;
  preferredTimeSlot: "morning" | "afternoon" | "any";
}

const RETRY_SCHEDULE: RetrySchedule[] = [
  { attempt: 1, delayHours: 0, preferredTimeSlot: "any" }, // Immediate
  { attempt: 2, delayHours: 2, preferredTimeSlot: "afternoon" }, // 2 hours, prefer afternoon
  { attempt: 3, delayHours: 4, preferredTimeSlot: "morning" }, // 4 hours, prefer next morning
  { attempt: 4, delayHours: 24, preferredTimeSlot: "morning" }, // Next day morning
  { attempt: 5, delayHours: 24, preferredTimeSlot: "afternoon" }, // Next day afternoon
];

const BUSINESS_HOURS = {
  start: 8, // 8 AM
  end: 17, // 5 PM
  timezone: "America/Chicago", // Supplier timezone or default
};

function calculateNextCallTime(attempt: number): Date {
  const schedule = RETRY_SCHEDULE[attempt - 1] || RETRY_SCHEDULE[RETRY_SCHEDULE.length - 1];

  let nextTime = new Date();
  nextTime.setHours(nextTime.getHours() + schedule.delayHours);

  // Adjust to business hours
  nextTime = adjustToBusinessHours(nextTime, schedule.preferredTimeSlot);

  return nextTime;
}

function adjustToBusinessHours(date: Date, preferredSlot: string): Date {
  const hour = date.getHours();

  // If outside business hours, move to next business day
  if (hour < BUSINESS_HOURS.start || hour >= BUSINESS_HOURS.end) {
    date.setDate(date.getDate() + 1);
    date.setHours(preferredSlot === "afternoon" ? 13 : 9, 0, 0, 0);
  }

  // Skip weekends
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}
```

### Maximum Retries & Failure

After **5 attempts** without success:

1. Mark batch as `FAILED`
2. Mark all POs in batch as `FAILED`
3. Add to daily failure report (visible in dashboard)

```typescript
async function handleMaxRetriesExhausted(batch: SupplierBatch): Promise<void> {
  await prisma.$transaction([
    prisma.supplierBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    }),
    prisma.purchaseOrder.updateMany({
      where: { batchId: batch.id },
      data: { status: "FAILED" },
    }),
  ]);

  // Log for reporting
  await prisma.activityLog.create({
    data: {
      entityType: "BATCH",
      entityId: batch.id,
      action: "MAX_RETRIES_EXHAUSTED",
      details: {
        attempts: batch.attemptCount,
        lastOutcome: batch.lastOutcome,
        posAffected: batch.poCount,
      },
    },
  });
}
```

---

## Dashboard UI

### Views

#### 1. Queue Overview (Home)

Main dashboard showing queue status and today's metrics.

```
┌─────────────────────────────────────────────────────────────────┐
│  Henkel PO Caller Dashboard                          [User ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│  │ Cancellations    │ │ Reschedules      │ │ Today            ││
│  │                  │ │                  │ │                  ││
│  │ Pending: 45      │ │ Pending: 123     │ │ Calls: 67        ││
│  │ In Progress: 3   │ │ In Progress: 5   │ │ Success: 52      ││
│  │ Completed: 234   │ │ Completed: 456   │ │ Failed: 8        ││
│  │ Failed: 12       │ │ Failed: 23       │ │ Pending: 7       ││
│  └──────────────────┘ └──────────────────┘ └──────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Active Calls                                                ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Supplier          │ POs │ Action  │ Status    │ Duration   ││
│  │ DERRY ENTERPRISES │ 4   │ Mixed   │ In Call   │ 2:34       ││
│  │ FIELD FASTENER MX │ 7   │ Cancel  │ Ringing   │ 0:12       ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Requires Attention                                   [12]  ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ • 8 batches failed (max retries)                          ││
│  │ • 4 POs flagged for conflict review                       ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Suppliers List

```
┌─────────────────────────────────────────────────────────────────┐
│  Suppliers                                      [Search...] 🔍  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Supplier            │ # │ Phone        │ Active │ Comp/Fail││
│  ├────────────────────────────────────────────────────────────┤│
│  │ DERRY ENTERPRISES   │80150│555-123-4567│ 3 batch│ 45 / 2   ││
│  │ FIELD FASTENER MX   │81096│555-234-5678│ 1 batch│ 23 / 1   ││
│  │ JOSEPH T RYERSON    │32919│555-345-6789│ 0 batch│ 12 / 0   ││
│  │ NEW YORK AIR BRAKE  │68776│555-456-7890│ 2 batch│ 8 / 3    ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 3. Supplier Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Suppliers / DERRY ENTERPRISES INC DBA FIELD                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Supplier #: 80150                                              │
│  Phone: 555-123-4567                                            │
│  Status: Active                                                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Active Batches                                              ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Batch ID  │ POs │ Actions      │ Value    │ Status         ││
│  │ batch_123 │ 4   │ Cancel(2),Ex │ $5,234   │ In Progress    ││
│  │ batch_456 │ 2   │ Push Out     │ $1,200   │ Scheduled 2pm  ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ All POs for this Supplier                          [Filter]││
│  ├────────────────────────────────────────────────────────────┤│
│  │ PO#-Line  │ Part       │ Action  │ Value   │ Status        ││
│  │ 531203-1  │ 063-22394  │ Cancel  │ $0.10   │ Completed     ││
│  │ 914446-12 │ 063-72107  │ Cancel  │ $55.40  │ In Progress   ││
│  │ 914446-40 │ 063-75867  │ Expedite│ $6.30   │ In Progress   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Call History                                                ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Date       │ Batch  │ Outcome      │ Duration │ [HR Link]  ││
│  │ Jan 8 10am │ b_123  │ Partial      │ 3:45     │ [View]     ││
│  │ Jan 7 2pm  │ b_122  │ No Answer    │ 0:30     │ [View]     ││
│  │ Jan 7 9am  │ b_122  │ No Answer    │ 0:25     │ [View]     ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4. Batch Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  ← DERRY ENTERPRISES / Batch batch_123                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Status: IN_PROGRESS                                            │
│  Actions: CANCEL (2), EXPEDITE (1), PUSH_OUT (1)                │
│  Total Value: $5,234.00                                         │
│  Attempts: 2 / 5                                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ POs in this Batch                                           ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ PO#-Line │ Part      │ Action  │ Due     │ New Date│ Status ││
│  │ 531203-1 │063-22394  │ Cancel  │ Jun 12  │ -       │ ✓ Done ││
│  │ 914446-12│063-72107  │ Cancel  │ Aug 15  │ -       │ Pending││
│  │ 914446-40│063-75867  │ Expedite│ Aug 15  │ Jul 20  │ Pending││
│  │ 929182-11│057-29695  │ Push Out│ Oct 28  │ Dec 15  │ Pending││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Call Attempts                                               ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ #1 │ Jan 7, 9:00am │ No Answer     │ 0:25 │ [View in HR]   ││
│  │ #2 │ Jan 7, 2:00pm │ Callback Req  │ 1:45 │ [View in HR]   ││
│  │ #3 │ Jan 8, 10:00am│ In Progress   │ -    │ [View in HR]   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 5. PO Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  ← PO 914446-12                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PO Number: 914446          Line: 12                            │
│  Part: 063-72107                                                │
│  Description: WASHER, FLT, TYPE A PLN, 3/8 N                    │
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐                      │
│  │ Action           │ │ Status           │                      │
│  │ CANCEL           │ │ IN_PROGRESS      │                      │
│  └──────────────────┘ └──────────────────┘                      │
│                                                                  │
│  Supplier: DERRY ENTERPRISES (#80150)                           │
│  Facility: SG                                                   │
│  Buyer: BFP                                                     │
│                                                                  │
│  Quantities:                                                    │
│  • Ordered: 5,540                                               │
│  • Received: 3,540                                              │
│  • Balance: 2,000                                               │
│                                                                  │
│  Dates:                                                         │
│  • PO Entry: Aug 8, 2024                                        │
│  • Due Date: Aug 15, 2024                                       │
│  • Recommended: -                                               │
│                                                                  │
│  Value: $55.40                                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Timeline                                                    ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Jan 8, 10:30am │ Call in progress (Attempt #3)             ││
│  │ Jan 7, 2:00pm  │ Callback requested by supplier            ││
│  │ Jan 7, 9:00am  │ No answer                                 ││
│  │ Jan 7, 8:45am  │ Queued for processing                     ││
│  │ Jan 7, 8:30am  │ Received from Henkel API                 ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 6. Conflicts Review

```
┌─────────────────────────────────────────────────────────────────┐
│  Conflicts Requiring Review                              [4]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ PO 768986-2                                     [Resolve]  ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Conflict: DUPLICATE_DIFFERENT_ACTION                       ││
│  │ Existing: EXPEDITE (Jan 5)                                 ││
│  │ Incoming: CANCEL (Jan 7)                                   ││
│  │                                                             ││
│  │ Resolution: [Cancel ▼] [Keep Expedite ▼] [Skip ▼]         ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Structure

```
/dashboard              - Queue overview (home)
/suppliers              - Suppliers list
/suppliers/:id          - Supplier detail
/batches                - All batches list
/batches/:id            - Batch detail
/pos                    - All POs list
/pos/:id                - PO detail
/conflicts              - Conflicts requiring review
/settings               - System configuration
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/henkel_po_caller"

# Redis
REDIS_URL="redis://localhost:6379"

# HappyRobot
HAPPYROBOT_WEBHOOK_CANCEL_URL="https://hooks.happyrobot.ai/webhook/xxx"
HAPPYROBOT_WEBHOOK_RESCHEDULE_URL="https://hooks.happyrobot.ai/webhook/yyy"
HAPPYROBOT_API_KEY="hr_api_xxxxx"
HAPPYROBOT_ORG_ID="org_xxxxx"

# App
APP_URL="https://henkel-po-caller.railway.app"
NEXTAUTH_SECRET="xxxxx"
NEXTAUTH_URL="https://henkel-po-caller.railway.app"

# Queue Processing
QUEUE_POLL_INTERVAL_MS="5000"
MAX_CONCURRENT_CALLS="5"
```

### System Configuration (Database)

```typescript
interface SystemConfig {
  // Batching
  maxPOsPerBatch: number; // Default: 10

  // Retry
  maxRetryAttempts: number; // Default: 5

  // Business Hours
  businessHoursStart: number; // Default: 8 (8 AM)
  businessHoursEnd: number; // Default: 17 (5 PM)
  businessTimezone: string; // Default: "America/Chicago"

  // Queue
  queuePollIntervalMs: number; // Default: 5000
  maxConcurrentCalls: number; // Default: 5
}
```

---

## Database Schema

### Prisma Schema Extension

```prisma
// Add to existing schema

// ============================================================================
// SUPPLIERS
// ============================================================================

model Supplier {
  id             String   @id @default(cuid())
  supplierNumber String   @unique
  name           String
  phone          String
  facility       String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // Relations
  purchaseOrders PurchaseOrder[]
  batches        SupplierBatch[]

  @@index([supplierNumber])
  @@map("suppliers")
}

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

model PurchaseOrder {
  id                   String       @id @default(cuid())
  externalId           String?      @unique // {PO#}-{Line}

  // Foreign keys
  supplierId           String
  batchId              String?

  // Classification
  actionType           POActionType
  status               POStatus     @default(PENDING)

  // PO Data
  poNumber             String
  poLine               Int
  partNumber           String
  partType             String?
  description          String?
  extraDescription     String?

  // Quantities
  quantityOrdered      Decimal      @db.Decimal(12, 2)
  quantityReceived     Decimal      @db.Decimal(12, 2)
  quantityBalance      Decimal      @db.Decimal(12, 2)

  // Dates
  dueDate              DateTime
  recommendedDate      DateTime?
  poEntryDate          DateTime?

  // Pricing
  expectedUnitCost     Decimal      @db.Decimal(12, 5)
  calculatedTotalValue Decimal      @db.Decimal(12, 2)
  priceSourceCode      Int?

  // Metadata
  buyer                String?
  facility             String
  warehouseId          String?
  facilityItemType     String?
  daysInTransit        Int?
  dispositionStatus    String?
  poRevision           Int?

  // Raw data
  rawData              Json?

  // Timestamps
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
  completedAt          DateTime?

  // Relations
  supplier             Supplier     @relation(fields: [supplierId], references: [id])
  batch                SupplierBatch? @relation(fields: [batchId], references: [id])

  @@unique([poNumber, poLine])
  @@index([supplierId])
  @@index([batchId])
  @@index([status])
  @@index([actionType])
  @@map("purchase_orders")
}

enum POActionType {
  CANCEL
  EXPEDITE
  PUSH_OUT
}

enum POStatus {
  PENDING      // Received, not yet batched
  QUEUED       // In a batch, waiting for call
  IN_PROGRESS  // Call in progress
  COMPLETED    // Successfully processed
  FAILED       // Failed after max retries
  CONFLICT     // Flagged for human review
}

// ============================================================================
// SUPPLIER BATCHES
// ============================================================================

model SupplierBatch {
  id                String      @id @default(cuid())
  supplierId        String

  // Status
  status            BatchStatus @default(PENDING)

  // Batch composition
  actionTypes       String[]    // ["CANCEL", "EXPEDITE", "PUSH_OUT"]
  totalValue        Decimal     @db.Decimal(12, 2)
  poCount           Int
  priority          Int         @default(0)

  // Retry tracking
  attemptCount      Int         @default(0)
  maxAttempts       Int         @default(5)
  scheduledFor      DateTime?

  // HappyRobot tracking
  happyRobotRunId   String?

  // Outcome
  lastOutcome       String?
  lastOutcomeReason String?

  // Timestamps
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  completedAt       DateTime?

  // Relations
  supplier          Supplier    @relation(fields: [supplierId], references: [id])
  purchaseOrders    PurchaseOrder[]
  agentRuns         POAgentRun[]

  @@index([supplierId])
  @@index([status])
  @@index([status, scheduledFor])
  @@map("supplier_batches")
}

enum BatchStatus {
  PENDING      // Created, not queued
  QUEUED       // In queue waiting
  IN_PROGRESS  // Call active
  COMPLETED    // All POs resolved
  FAILED       // Max retries exhausted
  PARTIAL      // Some POs resolved, others need retry
}

// ============================================================================
// AGENT RUNS (Call attempts)
// ============================================================================

model POAgentRun {
  id            String        @id @default(cuid())
  batchId       String

  // HappyRobot tracking
  externalId    String?       @unique // HappyRobot run_id
  externalUrl   String?       // Link to HR platform

  // Status
  status        PORunStatus   @default(PENDING)

  // Outcome
  outcome       String?
  outcomeReason String?

  // Timing
  scheduledFor  DateTime?
  startedAt     DateTime?
  endedAt       DateTime?
  duration      Int?          // seconds

  // Attempt tracking
  attempt       Int           @default(1)

  // Metadata
  metadata      Json?

  // Timestamps
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  // Relations
  batch         SupplierBatch @relation(fields: [batchId], references: [id])

  @@index([batchId])
  @@index([externalId])
  @@index([status])
  @@map("po_agent_runs")
}

enum PORunStatus {
  PENDING
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  FAILED
  NO_ANSWER
  CANCELLED
}

// ============================================================================
// CONFLICTS
// ============================================================================

model POConflict {
  id               String    @id @default(cuid())
  purchaseOrderId  String

  conflictType     String
  conflictDetails  Json

  // Resolution
  resolvedAt       DateTime?
  resolvedBy       String?
  resolution       String?
  resolutionNotes  String?

  createdAt        DateTime  @default(now())

  @@index([resolvedAt])
  @@map("po_conflicts")
}

// ============================================================================
// ACTIVITY LOG
// ============================================================================

model POActivityLog {
  id         String   @id @default(cuid())
  entityType String   // "PO", "BATCH", "SUPPLIER"
  entityId   String
  action     String
  details    Json?
  userId     String?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([createdAt])
  @@map("po_activity_logs")
}

// ============================================================================
// SYSTEM CONFIG
// ============================================================================

model POSystemConfig {
  id                   String   @id @default(cuid())
  key                  String   @unique
  value                Json
  description          String?
  updatedAt            DateTime @updatedAt

  @@map("po_system_config")
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation)

**Goal**: Basic data model, API upload, and database setup.

**Tasks**:

- [ ] Set up project structure (clone/adapt from unir-demo)
- [ ] Create Prisma schema for new entities
- [ ] Implement Supplier, PurchaseOrder models
- [ ] Create upload API endpoints (cancellations, reschedules)
- [ ] Implement classification logic
- [ ] Implement data validation and transformation
- [ ] Basic conflict detection

**Deliverables**:

- Working API that accepts PO uploads
- Data stored correctly in PostgreSQL
- POs classified by action type

### Phase 2: Queue Management

**Goal**: Redis-based queue system with priority ordering.

**Tasks**:

- [ ] Set up Redis connection
- [ ] Implement SupplierBatch grouping logic
- [ ] Create queue operations (enqueue, dequeue, schedule)
- [ ] Implement priority calculation
- [ ] Create batch size limiting
- [ ] Build queue monitoring endpoints

**Deliverables**:

- POs grouped into supplier batches
- Batches queued by priority (value)
- Queue status endpoints working

### Phase 3: HappyRobot Integration

**Goal**: Connect to HappyRobot for making calls.

**Tasks**:

- [ ] Implement workflow triggering
- [ ] Create webhook handler endpoint
- [ ] Handle all webhook event types
- [ ] Implement outcome processing
- [ ] Create AgentRun tracking

**Deliverables**:

- Batches trigger HappyRobot calls
- Webhook updates received and processed
- Call status tracked in database

### Phase 4: Retry Logic

**Goal**: Smart retry with business hours scheduling.

**Tasks**:

- [ ] Implement retry schedule logic
- [ ] Create business hours calculation
- [ ] Build callback queue processing
- [ ] Implement max retries handling
- [ ] Create failure reporting

**Deliverables**:

- Failed calls automatically retry
- Retries scheduled during business hours
- Max retry exhaustion handled

### Phase 5: Dashboard UI

**Goal**: Full dashboard for monitoring and management.

**Tasks**:

- [ ] Queue overview page
- [ ] Suppliers list and detail pages
- [ ] Batch detail pages
- [ ] PO detail pages
- [ ] Conflict review interface
- [ ] Real-time status updates

**Deliverables**:

- Complete dashboard UI
- All views functional
- Real-time updates working

### Phase 6: Polish & Production

**Goal**: Production-ready deployment.

**Tasks**:

- [ ] Error handling improvements
- [ ] Logging and monitoring
- [ ] Performance optimization
- [ ] Security review
- [ ] Documentation
- [ ] Railway deployment configuration

**Deliverables**:

- Production deployment on Railway
- Monitoring in place
- Documentation complete

---

## Appendix

### Sample API Payloads

#### Upload Cancellation Request

```json
{
  "pos": [
    {
      "poNumber": "531203",
      "poLine": 1,
      "supplierNumber": "80150",
      "supplierName": "DERRY ENTERPRISES INC DBA FIELD",
      "supplierPhone": "+1-555-123-4567",
      "partNumber": "063-22394",
      "description": "SCREW, TRUSS HD PHILLIPS",
      "quantityOrdered": 1.0,
      "quantityReceived": 0.0,
      "quantityBalance": 1.0,
      "dueDate": "2020-06-12",
      "expectedUnitCost": 0.1,
      "calculatedTotalValue": 0.1,
      "buyer": "BFP",
      "facility": "SG",
      "warehouseId": "SGQ"
    }
  ],
  "metadata": {
    "uploadSource": "api",
    "batchId": "henkel_batch_001"
  }
}
```

#### Upload Reschedule Request

```json
{
  "pos": [
    {
      "poNumber": "579356",
      "poLine": 1,
      "supplierNumber": "80150",
      "supplierName": "DERRY ENTERPRISES INC DBA FIELD",
      "supplierPhone": "+1-555-123-4567",
      "partNumber": "063-38242",
      "description": "BOLT,HEX, 1\"-8NC",
      "quantityOrdered": 1.0,
      "quantityReceived": 0.0,
      "quantityBalance": 1.0,
      "dueDate": "2021-06-30",
      "recommendedDate": "2026-01-27",
      "expectedUnitCost": 2.0085,
      "calculatedTotalValue": 2.0085,
      "buyer": "BFP",
      "facility": "SG"
    }
  ]
}
```

### HappyRobot Webhook Examples

#### Call Started

```json
{
  "run_id": "run_abc123",
  "event_type": "started",
  "timestamp": "2026-01-08T14:30:00Z",
  "data": {
    "status": "in_progress"
  }
}
```

#### Call Completed - Success

```json
{
  "run_id": "run_abc123",
  "event_type": "completed",
  "timestamp": "2026-01-08T14:35:00Z",
  "data": {
    "status": "completed",
    "outcome": "success",
    "duration": 312,
    "poResults": [
      { "poNumber": "531203", "poLine": 1, "confirmed": true },
      { "poNumber": "914446", "poLine": 12, "confirmed": true }
    ]
  }
}
```

#### Call Completed - Callback Requested

```json
{
  "run_id": "run_abc123",
  "event_type": "completed",
  "timestamp": "2026-01-08T14:35:00Z",
  "data": {
    "status": "completed",
    "outcome": "callback_requested",
    "outcomeReason": "Contact asked to call back after 3pm",
    "callbackRequested": true,
    "callbackReason": "busy_now",
    "duration": 45
  }
}
```

---

_Last updated: January 2026_
_Version: 1.0_
