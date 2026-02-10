# HappyRobot Workflow Setup Guide

## Overview

This document describes how to set up the HappyRobot workflow for Trinity PO Caller.

## Workflow Structure

```
📥 Incoming Webhook (includes first_po + overview)
   │
   ▼
🤖 AI Agent: "Outbound Voice Agent"
   │
   ├─── 📋 Prompt: POHandlerPrompt
   │
   ├─── 🔧 Tool: get_next_po (Webhook GET)
   ├─── 🔧 Tool: send_log (Webhook POST)
   └─── 🔧 Tool: check_with_boss (Slack → Wait for reply)
   │
   ▼
✨ AI Generate (summarize call for email)
   │
   ▼
📧 Gmail: Send email (confirmation to supplier)
```

## Step 1: Create Incoming Webhook

1. In HappyRobot, create a new **Incoming Webhook** node
2. Configure:
   - **Name**: `Trinity PO Trigger`
   - **API Key**: Generate and save as `HAPPYROBOT_X_API_KEY`
3. Copy the webhook URL → Save as `HAPPYROBOT_WEBHOOK_URL`

**Expected Payload**:

```json
{
  "batch_id": {{batch_id}},
  "attempt": {{attempt}},
  "phone": {{phone}},
  "supplier_name": {{supplier_name}},
  "supplier_number": {{supplier_number}},
  "supplier_email": {{supplier_email}},
  "po_count": {{po_count}},
  "total_value": {{total_value}},
  "action_types": {{action_types}},
  "first_po": {
    "id": {{first_po.id}},
    "po_number": {{first_po.po_number}},
    "po_line": {{first_po.po_line}},
    "description": {{first_po.description}},
    "action_type": {{first_po.action_type}},
    "due_date": {{first_po.due_date}},
    "recommended_date": {{first_po.recommended_date}},
    "quantity_balance": {{first_po.quantity_balance}},
    "total_value": {{first_po.total_value}}
  }
}
```

> **Note:** Callback URL is set as env var `TRINITY_CALLBACK_URL` in HappyRobot, not passed in payload.

## Step 2: Create AI Agent

Create an **Outbound Voice Agent** node with the prompt from `main_agent_prompt.md`.

### Agent Settings

| Setting      | Value                      |
| ------------ | -------------------------- |
| Name         | Outbound Voice Agent       |
| Voice        | Professional (your choice) |
| Language     | English                    |
| Max Duration | 10 minutes                 |
| Phone        | `{{phone}}` (from webhook) |

### Variables to Pass

Map these from the incoming webhook:

```
{{batch_id}} → batch_id
{{attempt}} → attempt
{{phone}} → phone
{{supplier_name}} → supplier_name
{{supplier_number}} → supplier_number
{{supplier_email}} → supplier_email
{{po_count}} → po_count
{{total_value}} → total_value
{{action_types}} → action_types
{{first_po.id}} → first_po.id
{{first_po.po_number}} → first_po.po_number
{{first_po.po_line}} → first_po.po_line
{{first_po.description}} → first_po.description
{{first_po.action_type}} → first_po.action_type
{{first_po.due_date}} → first_po.due_date
{{first_po.recommended_date}} → first_po.recommended_date
{{first_po.quantity_balance}} → first_po.quantity_balance
{{first_po.total_value}} → first_po.total_value
```

Plus the env var `TRINITY_CALLBACK_URL` for callback URL.

## Step 3: Configure Tools

### Tool 1: get_next_po

**Purpose**: Fetch the next PO to discuss (one at a time)

**Configuration**:

- Type: Webhook
- Method: GET
- URL: `https://trinity-po-caller-production.up.railway.app/api/batches/{{batch_id}}/next-po`
- Headers: `X-API-Key: {{TRINITY_WEBHOOK_SECRET}}`

**Agent Description**:

```
Fetch the next purchase order to discuss from Trinity's system.
Call this AFTER logging the outcome of the current PO with send_log.
When you log with po_outcome "confirmed", the PO is marked as resolved server-side.
Returns null when all POs have been discussed.

No parameters needed.

Returns:
- po: Next PO object with id, po_number, po_line, description, action_type, dates, value (or null if done)
- remaining: Count of POs still remaining after this one
```

---

### Tool 2: send_log

**Purpose**: Real-time status updates to Trinity dashboard

**Configuration**:

- Type: Webhook
- Method: POST
- URL: `{{TRINITY_CALLBACK_URL}}`
- Headers: `X-API-Key: {{TRINITY_WEBHOOK_SECRET}}`

**Body Schema**:

```json
{
  "event_type": "log",
  "batch_id": "{{batch_id}}",
  "message": "<string>",
  "level": "info|success|warning|error",
  "po_id": "<string|null>",
  "po_outcome": "confirmed|rejected|pending|null"
}
```

**Agent Description**:

```
Send a real-time status update to the Trinity dashboard.
Use this frequently throughout the call to log progress.

Parameters:
- message: What happened (e.g., "Connected to supplier", "PO 4500123 confirmed")
- level: info (general), success (positive), warning (concern), error (problem)
- po_id: The specific PO ID if this log is about a PO (optional)
- po_outcome: confirmed/rejected/pending if resolving a PO (optional)
```

---

### Tool 3: check_with_boss

**Purpose**: Escalate issues to Trinity team via Slack

**Configuration**:

- Type: Slack
- Action: Send channel message
- Channel: #trinity-po-escalations (or your choice)

**Message Template**:

```
🚨 *PO Escalation Required*
*Batch:* {{batch_id}}
*Supplier:* {{supplier_name}} ({{supplier_number}})
*Issue:* {{reason}}
*Priority:* {{priority}}
```

**Agent Description**:

```
Escalate an issue to Trinity's team via Slack and WAIT for their response.
The tool sends a message and waits for a reply in the thread.
Use when you need approval for alternative dates, additional costs, or unusual situations.

Parameters:
- reason: Detailed description of the issue
  Examples:
  - "Supplier cannot meet expedite request for PO 4500123458. Requested: Feb 15. Supplier offered: March 1. Should we accept?"
  - "Supplier requesting 15% rush fee ($225,000) to expedite PO 4500123459. Original value: $1.5M. Should we accept?"
  - "Supplier claims PO 4500123456 was already shipped last week. Need verification."

- priority: low / medium / high
  - low: Minor scheduling question
  - medium: Date change needs approval
  - high: Money involved or urgent issue

Returns: The boss's reply (e.g., "Yes, accept March 1" or "No, keep original date")
```

## Step 4: AI Generate Node

After the agent completes, add an **AI Generate** node to create the email body.

**Prompt**:

```
You are generating a confirmation email to send to a supplier after a phone call from Trinity Rail.

Based on the call transcript below, create a professional email body.

CALL TRANSCRIPT:
{{transcript}}

SUPPLIER INFO:
- Company: {{supplier_name}}
- Supplier Number: {{supplier_number}}

EMAIL REQUIREMENTS:
1. Start with "Dear {{supplier_name}} Team,"
2. Reference today's phone call
3. List each PO discussed with its outcome:
   - PO Number (full number, not abbreviated)
   - Action confirmed (Cancellation / Push Out to [date] / Expedite to [date])
   - Include any special notes (rush fees, alternative dates agreed, etc.)
4. End with contact information for questions
5. Sign off as "Trinity Rail Procurement Team"

FORMAT:
- Use plain text (no HTML)
- Keep it concise and professional
- Use bullet points for the PO list

EXAMPLE OUTPUT:
Dear ABC Industries Team,

Thank you for taking the time to speak with us today regarding your purchase orders with Trinity Rail.

This email confirms the following actions discussed during our call:

• PO 4500123456, Line 1 - Cancellation confirmed
• PO 4500123457, Line 1 - Delivery pushed out to March 15, 2026
• PO 4500123458, Line 2 - Delivery expedited to March 1, 2026

If you have any questions or need to discuss these changes further, please contact us at procurement@trinityrail.com.

Thank you for your continued partnership.

Best regards,
Trinity Rail Procurement Team
```

---

## Step 5: Gmail Send Email

Add a **Gmail** node to send the confirmation email:

**Configuration**:

- Type: Gmail
- Action: Send email
- To: `{{supplier_email}}`
- Subject: `Trinity Rail - PO Confirmation Summary`
- Body: Use HTML template from `email_templates/po_confirmation.html`
  - Replace `{{email_body}}` with output from AI Generate node

## Environment Variables Required

### In Trinity App (Railway):

```bash
# HappyRobot Outbound (to trigger workflows)
HAPPYROBOT_WEBHOOK_URL=https://hooks.happyrobot.ai/webhook/xxxxx
HAPPYROBOT_X_API_KEY=<api-key-for-triggering>

# HappyRobot Inbound (webhook security)
HAPPYROBOT_WEBHOOK_SECRET=<secret-for-validating-incoming-webhooks>

# HappyRobot Dashboard URLs
HAPPYROBOT_ORG_SLUG=trinity
HAPPYROBOT_WORKFLOW_ID=<your-workflow-id>

# App URL
APP_URL=https://trinity-po-caller-production.up.railway.app
```

### In HappyRobot Workflow:

```bash
TRINITY_CALLBACK_URL=https://trinity-po-caller-production.up.railway.app/api/webhooks/happyrobot
TRINITY_WEBHOOK_SECRET=<same-as-HAPPYROBOT_WEBHOOK_SECRET>
```

## Testing

1. **Test Incoming Webhook**: Click "Start Call" button in Trinity UI on a QUEUED batch
2. **Test check_pending_POs**: Verify agent can fetch PO data from your API
3. **Test send_log**: Verify logs appear in real-time in BatchModal
4. **Test Full Flow**: Run a complete call and verify all status updates appear

## Troubleshooting

| Issue                     | Solution                                   |
| ------------------------- | ------------------------------------------ |
| Webhook not triggering    | Check `HAPPYROBOT_WEBHOOK_URL` is correct  |
| check_pending_POs failing | Verify `HAPPYROBOT_WEBHOOK_SECRET` matches |
| No logs in UI             | Check SSE connection in BatchModal         |
| Wrong number called       | Check phone override in demo config        |
