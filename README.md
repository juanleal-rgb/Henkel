# Henkel PO Caller

> AI-powered Purchase Order management system with automated supplier communication via HappyRobot AI agents.

**Version**: 0.1.0 | **Status**: Production Ready | **Deployed on**: Railway

---

## Overview

Henkel PO Caller automates supplier communication for purchase order updates at Henkel. The system processes Excel files containing PO data, classifies orders by action type (Cancel, Expedite, Push Out), creates optimized call batches, and leverages HappyRobot AI agents to make automated phone calls to suppliers.

**Key Capabilities**:

- Excel PO file upload with automatic classification
- Intelligent batching by supplier and action type
- Real-time pipeline visualization with live updates
- HappyRobot AI integration for automated supplier calls
- Server-Sent Events for instant UI updates
- Comprehensive audit trail and activity logging

---

## Business Context

### The Problem

Henkel manages thousands of purchase orders across hundreds of suppliers. When supply chain conditions change, buyers need to communicate PO updates to suppliers:

- **CANCEL**: PO no longer needed
- **EXPEDITE**: Need delivery sooner than original due date
- **PUSH OUT**: Delay delivery to a later date

Manually calling each supplier is time-consuming and error-prone. This system automates the outreach process while maintaining full visibility into call outcomes.

### How It Works

1. **Upload**: Buyer uploads Excel file with PO data
2. **Classify**: System determines action type (Cancel/Expedite/Push Out)
3. **Batch**: POs grouped by supplier, prioritized by value
4. **Queue**: Batches enter processing queue
5. **Call**: HappyRobot AI agent calls supplier
6. **Resolve**: Agent confirms changes, updates PO status
7. **Report**: Full audit trail available

---

## User Journey

### 1. Empty State (First Visit)

When no data exists, the dashboard shows an empty state prompting the user to upload their first PO file.

```
┌─────────────────────────────────────────────────────────────┐
│  📊 PO Pipeline                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │         📁 No purchase orders yet                   │   │
│  │                                                     │   │
│  │     Upload an Excel file to get started with       │   │
│  │     your first batch of POs.                       │   │
│  │                                                     │   │
│  │            [ Upload PO File ]                       │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2. Upload Process

Click the upload FAB (bottom right) or empty state button:

```
┌─────────────────────────────────────────────────┐
│  📤 Upload Purchase Orders                       │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │                                            │ │
│  │     Drag & drop your Excel file here       │ │
│  │              or click to browse            │ │
│  │                                            │ │
│  │     Supports: .xlsx, .xls                  │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Preview:                                        │
│  ├─ 523 total rows detected                     │
│  ├─ 89 CANCEL orders                            │
│  ├─ 312 EXPEDITE orders                         │
│  └─ 122 PUSH_OUT orders                         │
│                                                  │
│            [ Cancel ]  [ Upload 523 POs ]        │
└─────────────────────────────────────────────────┘
```

**Upload Progress Stages**:

1. Parsing Excel file
2. Validating data format
3. Creating suppliers
4. Creating purchase orders
5. Creating batches
6. Complete

### 3. Pipeline View (Dashboard)

After upload, the dashboard shows a Sankey-style flow diagram visualizing batch progression:

```
                                                              ┌─────────────┐
                                                         ╱───▶│  COMPLETED  │
                                                        ╱     │      ✓      │
┌─────────────┐                  ┌─────────────┐       ╱      └─────────────┘
│   QUEUED    │                  │ IN PROGRESS │──────╱
│             │═════════════════▶│             │──────╲       ┌─────────────┐
│     110     │                  │      0      │       ╲─────▶│   FAILED    │
│     ▤▤▤     │                  │      📞     │        ╲     │      ✗      │
└─────────────┘                  └─────────────┘         ╲    └─────────────┘
                                                          ╲
                                                           ╲  ┌─────────────┐
                                                            ╲▶│   PARTIAL   │
                                                              │      ⚠      │
                                                              └─────────────┘

Flow: QUEUED ──▶ IN_PROGRESS ──▶ COMPLETED / FAILED / PARTIAL
```

**Key Features**:

- Animated flow lines showing batch progression
- Node sizes proportional to batch count or total value
- Toggle between "# Batches" and "$ Value" views
- Click any node to filter and see batch details

### 4. Supplier Detail Page

Click a batch card to navigate to the supplier detail:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                                                                  │
│                                                                          │
│  🏢 TERNIUM MEXICO                              #65477                   │
│  📞 +52 555 123 4567                                                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Batches (3)                          Filter: All ▼    Search...    │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │  ▼ Batch #142 - CANCEL              15 POs    $1.2M    ● QUEUED   │ │
│  │    ┌──────────────────────────────────────────────────────────┐   │ │
│  │    │ PO #      │ Part         │ Qty  │ Due Date   │ Status    │   │ │
│  │    │ 4500123   │ STEEL-001    │ 500  │ 2026-02-15 │ QUEUED    │   │ │
│  │    │ 4500124   │ WHEEL-002    │ 200  │ 2026-03-01 │ QUEUED    │   │ │
│  │    └──────────────────────────────────────────────────────────┘   │ │
│  │                                                                    │ │
│  │  ▶ Batch #138 - EXPEDITE            8 POs     $850K    ● IN_PROG  │ │
│  │  ▶ Batch #89  - PUSH_OUT            12 POs    $420K    ✓ COMPLETE │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5. Real-Time Updates

When a batch is being processed, the UI updates in real-time:

- Batch status changes (QUEUED → IN_PROGRESS → COMPLETED)
- Individual PO resolutions
- Call transcripts and agent messages
- Success/failure indicators

---

## Architecture

### System Flow

```mermaid
flowchart TB
    subgraph Client ["Frontend (Next.js)"]
        UI[React UI]
        SSE[SSE Client]
        Upload[Upload Modal]
    end

    subgraph API ["Backend (Next.js API Routes)"]
        UploadAPI["/api/upload/pos"]
        BatchAPI["/api/batches"]
        SupplierAPI["/api/suppliers"]
        CronAPI["/api/cron/process-queue"]
        WebhookAPI["/api/webhooks/happyrobot"]
        PipelineSSE["/api/pipeline/events"]
        BatchSSE["/api/batches/:id/events"]
    end

    subgraph Data ["Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis)]
    end

    subgraph External ["External Services"]
        HR[HappyRobot AI]
    end

    %% Upload Flow
    Upload -->|Excel File| UploadAPI
    UploadAPI -->|Parse & Classify| PG
    UploadAPI -->|Create Jobs| Redis
    UploadAPI -->|Publish Event| Redis

    %% Queue Processing
    CronAPI -->|Dequeue Batch| Redis
    CronAPI -->|Update Status| PG
    CronAPI -->|Trigger Call| HR

    %% Webhook Flow
    HR -->|Call Events| WebhookAPI
    WebhookAPI -->|Update PO Status| PG
    WebhookAPI -->|Publish Event| Redis

    %% SSE Flow
    Redis -->|Subscribe| PipelineSSE
    Redis -->|Subscribe| BatchSSE
    PipelineSSE -->|Stream| SSE
    BatchSSE -->|Stream| SSE
    SSE -->|Update| UI

    %% Read Operations
    UI -->|Fetch| BatchAPI
    UI -->|Fetch| SupplierAPI
    BatchAPI -->|Query| PG
    SupplierAPI -->|Query| PG
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    participant Redis
    participant HappyRobot

    %% Upload
    User->>Frontend: Upload Excel File
    Frontend->>API: POST /api/upload/pos
    API->>Database: Create Suppliers
    API->>Database: Create POs
    API->>Database: Create Batches
    API->>Redis: Enqueue Batches
    API->>Redis: Publish "upload_complete"
    Redis-->>Frontend: SSE: upload_complete
    Frontend->>User: Show Pipeline

    %% Processing
    loop Every 30s
        API->>Redis: Dequeue Batch
        API->>Database: Update Status → IN_PROGRESS
        API->>Redis: Publish "batch_started"
        Redis-->>Frontend: SSE: batch_started
        API->>HappyRobot: Trigger Call
    end

    %% Webhook
    HappyRobot->>API: POST /webhook (call events)
    API->>Database: Update PO Status
    API->>Redis: Publish "po_resolved"
    Redis-->>Frontend: SSE: po_resolved

    HappyRobot->>API: POST /webhook (call_complete)
    API->>Database: Update Batch → COMPLETED
    API->>Redis: Publish "batch_completed"
    Redis-->>Frontend: SSE: batch_completed
    Frontend->>User: Show Updated Status
```

### Database Schema

```mermaid
erDiagram
    User ||--o{ POActivityLog : creates
    Supplier ||--o{ PurchaseOrder : has
    Supplier ||--o{ SupplierBatch : has
    SupplierBatch ||--o{ PurchaseOrder : contains
    SupplierBatch ||--o{ POAgentRun : has
    SupplierBatch ||--o{ BatchLog : has
    PurchaseOrder ||--o{ POConflict : may_have

    User {
        string id PK
        string email UK
        string name
        string passwordHash
        enum role "ADMIN | OPERATOR"
        boolean isActive
    }

    Supplier {
        string id PK
        string supplierNumber UK
        string name
        string phone
        string email
        string facility
    }

    PurchaseOrder {
        string id PK
        string poNumber
        int poLine
        enum actionType "CANCEL | EXPEDITE | PUSH_OUT"
        enum status "PENDING | QUEUED | IN_PROGRESS | COMPLETED | FAILED | CONFLICT"
        date dueDate
        date recommendedDate
        decimal totalValue
        string supplierId FK
        string batchId FK
    }

    SupplierBatch {
        string id PK
        enum status "QUEUED | IN_PROGRESS | COMPLETED | FAILED | PARTIAL"
        json actionTypes
        int priority
        int attemptCount
        datetime scheduledFor
        string externalId
        string externalUrl
        string supplierId FK
    }

    POAgentRun {
        string id PK
        enum status "PENDING | SCHEDULED | IN_PROGRESS | COMPLETED | FAILED"
        string outcome
        json metadata
        string batchId FK
    }

    BatchLog {
        string id PK
        string type
        string level
        string message
        json data
        string batchId FK
    }

    POConflict {
        string id PK
        string conflictType
        string resolution
        boolean isResolved
        string poId FK
    }
```

---

## Tech Stack

### Frontend

| Technology   | Version | Purpose                         |
| ------------ | ------- | ------------------------------- |
| Next.js      | 14.2.35 | React framework with App Router |
| React        | 18.3.1  | UI library                      |
| TypeScript   | 5.7.2   | Type safety                     |
| Tailwind CSS | 3.4.17  | Styling                         |
| GSAP         | 3.14.2  | Animations                      |
| Zustand      | 5.0.2   | State management                |
| React Query  | 5.62.7  | Server state                    |
| Lucide       | 0.562.0 | Icons                           |

### Backend

| Technology         | Version | Purpose         |
| ------------------ | ------- | --------------- |
| Next.js API Routes | 14.2.35 | REST API        |
| Prisma             | 7.2.0   | ORM             |
| PostgreSQL         | 15+     | Database        |
| Redis (ioredis)    | 5.4.1   | Queue & Pub/Sub |
| NextAuth           | 4.24.10 | Authentication  |
| Zod                | 3.24.1  | Validation      |
| XLSX               | 0.18.5  | Excel parsing   |

### Infrastructure

| Technology | Purpose                   |
| ---------- | ------------------------- |
| Railway    | Cloud hosting             |
| Docker     | Containerization          |
| Bun        | Package manager & runtime |

---

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- PostgreSQL 15+
- Redis 6+

### Installation

```bash
# Clone repository
git clone https://github.com/happyrobot-ai/henkel-po-caller.git
cd henkel-po-caller

# Install dependencies
bun install

# Copy environment file
cp .env.example .env.local

# Configure environment variables (see below)

# Generate Prisma client
bun run db:generate

# Push schema to database
bun run db:push

# Seed initial data (admin user)
bun run db:seed

# Start development server
bun dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/henkel_po?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# HappyRobot Integration
HAPPYROBOT_WEBHOOK_CANCEL_URL=https://hooks.happyrobot.ai/webhook/xxxxx
HAPPYROBOT_WEBHOOK_RESCHEDULE_URL=https://hooks.happyrobot.ai/webhook/yyyyy
HAPPYROBOT_API_KEY=hr_api_xxxxxxxxxxxxx
HAPPYROBOT_ORG_ID=org_xxxxxxxxxxxxx
HAPPYROBOT_WEBHOOK_SECRET=your-webhook-secret

# Cron Job Security
CRON_SECRET=your-cron-secret

# App URLs
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Default Credentials

```
Email: admin@henkel.com
Password: AdmiU99&$
`

---

## API Reference

### Upload

| Method | Endpoint                      | Description                |
| ------ | ----------------------------- | -------------------------- |
| POST   | `/api/upload/pos`             | Upload Excel file with POs |
| GET    | `/api/upload/progress/:jobId` | Track upload progress      |

### Batches

| Method | Endpoint                  | Description                |
| ------ | ------------------------- | -------------------------- |
| GET    | `/api/batches`            | List batches (filterable)  |
| GET    | `/api/batches/stats`      | Aggregate KPIs by status   |
| GET    | `/api/batches/:id`        | Batch detail with POs      |
| PATCH  | `/api/batches/:id`        | Update batch (retry, etc.) |
| GET    | `/api/batches/:id/events` | SSE stream for batch logs  |

### Suppliers

| Method | Endpoint             | Description                  |
| ------ | -------------------- | ---------------------------- |
| GET    | `/api/suppliers`     | List suppliers with stats    |
| GET    | `/api/suppliers/:id` | Supplier detail with batches |
| PATCH  | `/api/suppliers/:id` | Update supplier info         |

### Real-Time

| Method | Endpoint               | Description                     |
| ------ | ---------------------- | ------------------------------- |
| GET    | `/api/pipeline/events` | SSE stream for pipeline updates |

### System

| Method   | Endpoint                   | Description                  |
| -------- | -------------------------- | ---------------------------- |
| GET      | `/api/health`              | Health check                 |
| POST     | `/api/reset`               | Reset database (dev only)    |
| GET/POST | `/api/cron/process-queue`  | Process queued batches       |
| POST     | `/api/webhooks/happyrobot` | HappyRobot callback receiver |

---

## Deployment

### Railway Deployment

1. **Create Railway Project**
   - Create new project in Railway dashboard
   - Add PostgreSQL service
   - Add Redis service
   - Add web service from GitHub repo

2. **Configure Environment**

```

DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
NEXTAUTH_SECRET=<generate>
NEXTAUTH_URL=https://your-app.railway.app
... (other env vars)

````

3. **Deploy**
- Railway auto-deploys on push to main
- Uses Dockerfile for build

4. **Set Up Cron Job**
- Create Railway cron service
- Schedule: `*/5 * * * *` (every 5 minutes)
- Command: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.railway.app/api/cron/process-queue`

### Railway Configuration

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
````

---

## Development

### Scripts

```bash
bun dev              # Start dev server
bun build            # Production build
bun start            # Start production server
bun run typecheck    # Type checking
bun run lint:fix     # Lint with auto-fix
bun run format       # Format code
bun run db:studio    # Open Prisma Studio
bun run db:migrate   # Create migration
bun run db:seed      # Seed database
```

### Project Structure

```
src/
├── app/
│   ├── (app)/              # Protected routes
│   │   ├── dashboard/      # Pipeline view
│   │   ├── suppliers/      # Supplier pages
│   │   └── layout.tsx      # Auth wrapper
│   ├── api/                # API routes
│   │   ├── batches/        # Batch endpoints
│   │   ├── suppliers/      # Supplier endpoints
│   │   ├── upload/         # Upload endpoints
│   │   ├── pipeline/       # SSE endpoints
│   │   ├── webhooks/       # External callbacks
│   │   └── cron/           # Background jobs
│   └── login/              # Auth page
├── components/
│   ├── pipeline/           # Pipeline UI
│   ├── suppliers/          # Supplier UI
│   ├── upload/             # Upload UI
│   ├── layout/             # Layout components
│   └── ui/                 # Base components
├── lib/
│   ├── excel-parser.ts     # Excel processing
│   ├── classification.ts   # PO classification
│   ├── batching.ts         # Batch creation
│   ├── queue.ts            # Redis queue
│   ├── redis.ts            # Pub/sub
│   └── prisma.ts           # Database client
├── hooks/
│   ├── use-pipeline-events.ts
│   └── use-batch-logs.ts
└── stores/
    └── ui-store.ts         # Zustand store
```

---

## Demo Configuration

For demos, configure supplier overrides via Settings:

1. Click **Settings** in sidebar
2. Search for a supplier
3. Add phone/email override
4. Save overrides

When batches are processed, the override contact info will be used instead of the actual supplier data.

---

## License

Proprietary - Henkel / HappyRobot AI

---

## Support

For questions or issues:

- Technical: fernando@happyrobot.ai
- Repository: https://github.com/happyrobot-ai/henkel-po-caller
