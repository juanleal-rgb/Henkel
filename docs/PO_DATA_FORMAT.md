# Henkel PO Data Format Specification

This document describes the structure and content of the Purchase Order (PO) Excel files used by Henkel.

## Source Files

| File                                           | Description                   | Rows  | Suppliers |
| ---------------------------------------------- | ----------------------------- | ----- | --------- |
| `Open POs as of 010626.xlsx`                   | Full superset of all open POs | 8,979 | 178       |
| `Open POs as of 010626 - Cancel Messages.xlsx` | POs to be cancelled           | 521   | 81        |

Both files use **identical 24-column format**.

---

## Column Reference

### Supplier Identification

| Column          | Type    | Required | Description                             |
| --------------- | ------- | -------- | --------------------------------------- |
| `Supplier #`    | Integer | Yes      | Unique supplier identifier (7 - 483412) |
| `Supplier Name` | String  | Yes      | Full supplier company name              |

**Note**: There are 178 unique `Supplier #` values but only 162 unique names (some suppliers may have multiple IDs).

### PO Identification

| Column        | Type    | Required | Description                              |
| ------------- | ------- | -------- | ---------------------------------------- |
| `PO #`        | Integer | Yes      | Purchase order number (482641 - 1013004) |
| `PO Line`     | Integer | Yes      | Line item within PO (1 - 260)            |
| `PO Revision` | Integer | Yes      | Revision count (0 - 61, usually 0)       |

**Primary Key**: `PO #` + `PO Line` combination is unique across all records.

### Part Information

| Column              | Type   | Required | Description              |
| ------------------- | ------ | -------- | ------------------------ |
| `Part`              | String | Yes      | Part number/identifier   |
| `Part Type`         | String | 99.9%    | Part classification code |
| `Description`       | String | Yes      | Short part description   |
| `Extra Description` | String | 95%      | Additional part details  |

**Part Type Values**:
| Code | Count | Description |
|------|-------|-------------|
| `P` | 6,375 | Standard purchased part |
| `VMI` | 1,894 | Vendor Managed Inventory |
| `R` | 587 | Raw material |
| `F` | 98 | Fabricated |
| `A` | 13 | Assembly |
| `0` | 1 | Unknown/Other |

### Quantities

| Column              | Type  | Required | Description                                  |
| ------------------- | ----- | -------- | -------------------------------------------- |
| `Quantity Ordered`  | Float | Yes      | Original quantity ordered (0.01 - 5,110,117) |
| `Quantity Received` | Float | Yes      | Quantity already received                    |
| `Quantity Balance`  | Float | Yes      | Outstanding quantity (`Ordered - Received`)  |

### Dates

| Column             | Type | Required | Description                          |
| ------------------ | ---- | -------- | ------------------------------------ |
| `Due Date`         | Date | Yes      | Current/original due date            |
| `Recommended Date` | Date | 68.5%    | New proposed date (reschedules only) |
| `PO Entry Date`    | Date | Yes      | When the PO was created              |

**Date Ranges**:

- `Due Date`: 2020-06-12 to 2028-12-10
- `Recommended Date`: 2026-01-06 to 2026-12-28
- `PO Entry Date`: 2020-06-03 to 2026-01-05

### Financial

| Column                   | Type    | Required | Description                             |
| ------------------------ | ------- | -------- | --------------------------------------- |
| `Expected Unit Cost`     | Float   | Yes      | Cost per unit ($0 - $19,400.69)         |
| `Calculated Total Value` | Float   | Yes      | `Quantity Balance * Expected Unit Cost` |
| `Price Source Code`      | Integer | Yes      | Pricing source indicator                |

**Price Source Code Values**:
| Code | Count | Description |
|------|-------|-------------|
| `3` | 6,793 | Most common (likely contract price) |
| `1` | 2,021 | Secondary source |
| `2` | 165 | Least common |

**Total Value**: Full file = $140,416,819.41 | Cancel file = $7,340,080.38

### Location/Logistics

| Column            | Type   | Required | Description                 |
| ----------------- | ------ | -------- | --------------------------- |
| `Facility`        | String | Yes      | Manufacturing facility code |
| `Warehouse ID`    | String | Yes      | Destination warehouse       |
| `Days In Transit` | Float  | 71%      | Expected shipping days      |

**Facility Codes**:
| Code | Count | Description |
|------|-------|-------------|
| `SB` | 3,391 | Primary facility |
| `MO` | 2,616 | Missouri facility |
| `LV` | 1,428 | Las Vegas |
| `FW` | 787 | Fort Worth |
| `SG` | 670 | Secondary |
| `NV` | 87 | Nevada |

**Warehouse ID**: 20 unique values, format is `{Facility}{Type}` (e.g., `SBR`, `MOQ`, `LV1`)

**Days In Transit Values**: 0, 5, 10, 15, 20, 45 (most common: 15 days)

### Administrative

| Column               | Type   | Required | Description                     |
| -------------------- | ------ | -------- | ------------------------------- |
| `Buyer`              | String | 99.9%    | Buyer code (17 unique values)   |
| `Disposition Status` | String | 2.2%     | Special handling status         |
| `Facility Item Type` | String | 99%      | Item classification at facility |

**Top Buyer Codes**: `BFM` (1,736), `BDA` (1,608), `BF3` (1,091), `BDG` (966)

**Disposition Status Values** (when present):

- `Pending Response from Supplier` (41)
- `Supply Risk` (31)
- `CM Approved Strategic Buy` (30)
- `TPAP` (20)
- `Change Order - Customer` (15)
- `Supplier rejects` (13)
- And others...

**Facility Item Type Values**:
| Code | Count |
|------|-------|
| `P` | 8,191 |
| `R` | 580 |
| `F` | 98 |
| `A` | 13 |

---

## Action Classification Logic

The system automatically classifies each PO into one of three action types based on the `Recommended Date` field:

```
IF Recommended Date IS NULL:
    Action = CANCEL

ELSE IF Recommended Date < Due Date:
    Action = EXPEDITE (need it sooner)

ELSE IF Recommended Date > Due Date:
    Action = PUSH_OUT (can wait longer)

ELSE IF Recommended Date = Due Date:
    Action = NONE (skip - no change needed)
```

### Classification Distribution (Full File)

| Action       | Count | Percentage | Description                               |
| ------------ | ----- | ---------- | ----------------------------------------- |
| **CANCEL**   | 2,831 | 31.5%      | No recommended date = cancel the PO       |
| **PUSH_OUT** | 4,683 | 52.2%      | Recommended date is later than due date   |
| **EXPEDITE** | 1,465 | 16.3%      | Recommended date is earlier than due date |
| **NONE**     | 0     | 0%         | Recommended equals due (theoretical)      |

### Reschedule Statistics

For POs with a `Recommended Date` (reschedules):

- **Days difference range**: -332 to +1,672 days
- **Mean shift**: +22 days (average push-out)
- **Median shift**: +9 days

---

## Supplier Statistics

### Top 10 Suppliers by PO Count

| Supplier # | Name                                     | PO Count |
| ---------- | ---------------------------------------- | -------- |
| 81096      | FIELD FASTENER MEXICO S DE RL DE CV      | 1,460    |
| 80021      | STEEL & PIPE SUPPLY DE MEXICO S DE RL DE | 573      |
| 37547      | STRATO INC                               | 349      |
| 83793      | GRUPO FOX USA CORP                       | 345      |
| 59970      | ABINSA SA DE CV                          | 303      |
| 82632      | MINER ENTERPRISES INC                    | 298      |
| 82561      | RIZHAO HONGYU ELECTRIC APPLIANCE CO LTD  | 289      |
| 38182      | SUMMIT METALS CORP                       | 246      |
| 70983      | STEEL & PIPE SUPPLY CO INC               | 234      |
| 82875      | COHN & GREGORY SUPPLY LLC                | 227      |

### Top 10 Suppliers by Total Value

| Supplier # | Name                                | Total Value |
| ---------- | ----------------------------------- | ----------- |
| 482687     | CLEVELAND-CLIFFS STEEL HOLDINGS INC | $17,407,224 |
| 67191      | AMSTED RAIL INC                     | $14,381,204 |
| 66072      | SSAB INC                            | $10,442,889 |
| 65477      | TERNIUM MEXICO                      | $9,609,458  |
| 66081      | FRIEDMAN IND INC                    | $8,025,196  |
| 82632      | MINER ENTERPRISES INC               | $7,381,696  |
| 59970      | ABINSA SA DE CV                     | $6,087,981  |
| 60947      | MCCONWAY & TORLEY LLC               | $4,796,753  |
| 33591      | STANDARD FORGED PRODUCTS LLC        | $4,374,880  |
| 81980      | MIDLAND MANUFACTURING CORP          | $3,444,246  |

---

## Data Mapping to Database

### Excel Column -> Prisma Field Mapping

| Excel Column             | Prisma Field                      | Type     | Notes                       |
| ------------------------ | --------------------------------- | -------- | --------------------------- |
| `Supplier #`             | `Supplier.supplierNumber`         | Int      | Unique identifier           |
| `Supplier Name`          | `Supplier.name`                   | String   |                             |
| `PO #`                   | `PurchaseOrder.poNumber`          | Int      |                             |
| `PO Line`                | `PurchaseOrder.poLine`            | Int      |                             |
| `PO Revision`            | `PurchaseOrder.poRevision`        | Int      |                             |
| `Part`                   | `PurchaseOrder.partNumber`        | String   |                             |
| `Part Type`              | `PurchaseOrder.partType`          | String   | Optional                    |
| `Description`            | `PurchaseOrder.description`       | String   |                             |
| `Extra Description`      | `PurchaseOrder.extraDescription`  | String   | Optional                    |
| `Quantity Ordered`       | `PurchaseOrder.quantityOrdered`   | Float    |                             |
| `Quantity Received`      | `PurchaseOrder.quantityReceived`  | Float    |                             |
| `Quantity Balance`       | `PurchaseOrder.quantityBalance`   | Float    |                             |
| `Due Date`               | `PurchaseOrder.dueDate`           | DateTime |                             |
| `Recommended Date`       | `PurchaseOrder.recommendedDate`   | DateTime | Optional, determines action |
| `PO Entry Date`          | `PurchaseOrder.entryDate`         | DateTime |                             |
| `Expected Unit Cost`     | `PurchaseOrder.unitCost`          | Float    |                             |
| `Calculated Total Value` | `PurchaseOrder.totalValue`        | Float    | For priority sorting        |
| `Price Source Code`      | `PurchaseOrder.priceSourceCode`   | Int      |                             |
| `Facility`               | `PurchaseOrder.facility`          | String   |                             |
| `Warehouse ID`           | `PurchaseOrder.warehouseId`       | String   |                             |
| `Days In Transit`        | `PurchaseOrder.daysInTransit`     | Int      | Optional                    |
| `Buyer`                  | `PurchaseOrder.buyerCode`         | String   | Optional                    |
| `Disposition Status`     | `PurchaseOrder.dispositionStatus` | String   | Optional                    |
| `Facility Item Type`     | `PurchaseOrder.facilityItemType`  | String   | Optional                    |
| _(derived)_              | `PurchaseOrder.actionType`        | Enum     | CANCEL/EXPEDITE/PUSH_OUT    |

---

## Validation Rules

### Required Fields

All of these must be present and non-empty:

- `Supplier #`, `Supplier Name`
- `PO #`, `PO Line`
- `Part`, `Description`
- `Quantity Ordered`, `Quantity Received`, `Quantity Balance`
- `Due Date`, `PO Entry Date`
- `Expected Unit Cost`, `Calculated Total Value`
- `Facility`, `Warehouse ID`

### Data Type Validation

- Dates should be parseable (Excel serial or ISO format)
- Numeric fields should be >= 0
- `Supplier #` and `PO #` should be positive integers

### Business Rules

- `Quantity Balance` should equal `Quantity Ordered - Quantity Received`
- `Calculated Total Value` should approximately equal `Quantity Balance * Expected Unit Cost`
- If `Recommended Date` is present, it should be a valid future-ish date

---

## Cancel File Specifics

The cancel file (`Open POs as of 010626 - Cancel Messages.xlsx`) is a **subset** of the full file where:

- **100% of records have NULL `Recommended Date`**
- All 521 records should be classified as `CANCEL`
- Contains 81 unique suppliers
- Total value: $7,340,080.38

This file can be used to verify the classification logic works correctly.
