# PersonalizeMePrints — Dev Proposals

> **Last updated:** 2026-05-25  
> **Working branch:** Branch_1  
> **Critical constraint:** SSA (Singular Spectrum Analysis) module must NEVER be touched — ever.

---

## Status Legend

| Badge | Meaning |
|-------|---------|
| ✅ Done | Fully implemented and verified |
| 🔄 In Progress | Partially implemented — phases remain |
| 📋 Pending | Not yet started |
| 🔴 High Priority | Do next |
| 🟡 Medium Priority | Do after high priority |
| 🔵 Low Priority | Backlog / future session |

---

## Summary Table

| # | Proposal | Status | Priority |
|---|----------|--------|----------|
| P1 | Dashboard Overview Dead Links | ✅ Done | — |
| P2 | Order Timeout / Expiration System | 🔄 Phase 1 Done | 🟡 Phase 2 next |
| P3 | Admin Dashboard Redesign | 🔄 Partially Done | 🟡 Medium |
| P4 | Customer Order History & Details | 🔄 Phase 1 Done | 🟡 Phase 2 next |
| P5 | Design Agreement & Terms Flow | 📋 Pending | 🔴 High |
| P6 | Job Order (JO) Module | 📋 Pending | 🔴 High |

---

---

## Proposal 1 — Dashboard Overview Dead Links

**Status:** ✅ Done (implemented 2026-05-22)  
**Effort:** Was a 2-line change

---

### What Was Fixed

Four dead links in `dashboardoverview` pointed to deleted routes. All four were updated:

| Old Route | New Route | File |
|-----------|-----------|------|
| `/dashboard/business/inventory` | `/dashboard/business/inventory-v2` | `page.jsx` + `DashboardOverview.jsx` |
| `/dashboard/business/inventory/vendors` | `/dashboard/business/inventory-v2` | `page.jsx` |
| `/dashboard/business/inventory/returns` | `/dashboard/business/inventory-v2` | `page.jsx` |
| `/dashboard/business/products` | `/dashboard/business/products-v2` | `page.jsx` |

Additionally, 3 dead links in the Action Required section of `DashboardOverview.jsx` were fixed
(`/inventory` → `/inventory-v2`).

---

---

## Proposal 2 — Order Timeout / Expiration System

**Status:** 🔄 Phase 1 Done — Phase 2 & 3 Pending  
**Adviser input:** Included  
**Related:** Design approval flow (P5), payment flow, soft-delete (archive) system

---

### Phase 1 — Visual Indicators + Manual Admin Actions ✅ Done

**Implemented (2026-05-22):**

- `isExpired(order)` helper — flags orders with `orderStatus: 'Pending'`, `paymentStatus !== 'paid'`,
  and `createdAt` older than 7 days (`EXPIRY_DAYS = 7`)
- `⏰ Expired` badge displayed next to status pill in the admin orders table
- **Mark Expired** button (amber) appears in the order detail modal when `canExpire` is true —
  calls `PUT /api/admin/orders/:id` with `{ orderStatus: 'Cancelled', cancellationReason: 'order_expired' }`
- **Expired Orders card** added to the admin dashboard overview — shows count of pending unpaid
  orders older than 7 days, turns red when count > 0, links to `/orders`

**Files touched:**
- `frontend/app/dashboard/business/orders/page.jsx`
- `frontend/app/dashboard/business/dashboardoverview/page.jsx`
- `frontend/app/dashboard/business/dashboardoverview/DashboardOverview.jsx`

---

### Background & Principle

> The further along an order is, the more the business has invested — so the stricter the enforcement.

This system handles the scenario where customers go silent at 3 critical stages of the custom order
flow. It protects the business from dead orders occupying the queue indefinitely.

---

### The 3 Timeout Stages

---

#### Stage 1 — Design Proof Sent, Customer Not Responding

**Order status:** `proof_sent`  
**Trigger:** Admin uploads design draft and customer hasn't approved or requested revision  
**Industry term:** Proof Expiration (used by Vistaprint, custom print shops, etc.)

| Day | Action |
|-----|--------|
| Day 2 | Auto-send reminder: *"Your design is ready, waiting for your approval"* |
| Day 5 | Auto-send firm reminder: *"Your design will expire in 2 days"* |
| Day 7 | Auto-send final notice: *"Design expires today — order will be cancelled"* |
| Day 7+ | Admin sees **⏰ Overdue** badge — manual Cancel button appears |

**On cancel:**
- Order → `Cancelled`, reason: `design_approval_timeout`
- Downpayment is **non-refundable** (design labor was already performed)
- Admin keeps the DP — this is legally standard for custom creative services
- Must be stated in Terms & Conditions

**Why manual cancel (not auto):** Small shop — relationships matter. Admin reviews before acting.
A loyal customer might just be busy. Auto-cancel risks hurting good customers.

---

#### Stage 2 — Design Approved, Downpayment Not Paid

**Order status:** `awaiting_payment`  
**Trigger:** Customer approved the design (or admin approved customer upload) but DP hasn't been paid to start production

| Day | Action |
|-----|--------|
| Day 2 | Auto-send reminder: *"Complete your downpayment to begin production"* |
| Day 3 | Auto-send final: *"Your order slot will be released if payment isn't received today"* |
| Day 3+ | Admin sees **⏰ Overdue** badge — manual Cancel button appears |

**On cancel:**
- Order → `Cancelled`, reason: `dp_payment_timeout`
- No refund needed — nothing was paid yet
- This is purely queue/slot management for the business

---

#### Stage 3 — Order Ready, Balance Not Paid

**Order status:** `for_qc` or ready for delivery (DP paid, awaiting final balance)  
**Trigger:** Product is physically made, customer isn't paying the remaining balance

| Day | Action |
|-----|--------|
| Day 3  | Auto-send reminder: *"Your order is ready! Pay your balance to schedule delivery"* |
| Day 7  | Auto-send firm reminder: *"Your order is being held. Please settle within 7 days"* |
| Day 14 | Auto-send final notice: *"Order will be forfeited after Day 30 if balance unpaid"* |
| Day 14+ | Admin sees **⏰ Overdue** badge — manual Archive button appears |
| Day 30 | Admin can permanently close the order |

**On archive:**
- Order → `isArchived: true` (soft delete — NOT cancelled)
- DP kept by business (covers production cost + materials)
- Item physically held by shop
- Customer can still come back, pay balance, and reclaim the order
- After 30 days admin can choose to permanently close

**Why Archive and not Cancel:**
- Product was already made — cancelling misleads the financial records
- Customer can still pay and reclaim (revenue opportunity)
- Audit trail is preserved
- Shows up in "Archived" filter in admin dashboard

---

### Recommended Thresholds (Adjustable)

| Stage | Reminder Days | Admin Action Available |
|-------|--------------|----------------------|
| Proof sent, no response | Day 2, Day 5 | Cancel at Day 7 |
| Awaiting DP, not paid | Day 2 | Cancel at Day 3 |
| Ready, balance not paid | Day 3, Day 7, Day 14 | Archive at Day 14, Close at Day 30 |

These are defaults. Phase 3 adds a settings page where the business owner can adjust them.

---

### Financial / Legal Notes

- Non-refundable DP must be stated in Terms & Conditions
- Every timeout action should be logged in `ActivityLog` (audit trail)
- `statusHistory` on the Order should include a `timeout_warning_sent` entry
- Customer notifications must be clear about the deadline and consequences

---

### Implementation Plan (Remaining)

#### Phase 2 — Automated Notifications 📋 Pending

Laravel scheduled job (`php artisan schedule:run` — runs daily).

- Checks all orders in timeout-eligible states (`proof_sent`, `awaiting_payment`, `for_qc`)
- Sends in-app + email reminders at the configured day marks
- Logs `timeoutWarningAt` on the order so reminders don't repeat
- Does NOT auto-cancel — admin still makes the final decision

**Effort:** Medium — Laravel scheduler + notification logic

**Files:**
- `backend/app/Console/Commands/CheckOrderTimeouts.php` — new scheduled command
- `backend/app/Console/Kernel.php` — register schedule
- `backend/app/Models/Order.php` — add `timeoutWarningAt` to `$casts`

---

#### Phase 3 — Configurable Durations 📋 Pending (Low priority)

Settings page in admin dashboard.

- Admin sets reminder and action thresholds per stage
- Defaults baked in (values from the table above)
- Toggle: enable/disable the timeout system entirely
- Toggle: auto-cancel vs manual-only

**Effort:** Low — settings model + UI inputs

---

---

## Proposal 3 — Admin Dashboard Redesign

**Status:** 🔄 Partially Done — Full redesign pending  
**Do not touch:** SSA (Singular Spectrum Analysis) module — leave as-is  
**Reference:** Shopify, Shopee Seller Center, Lazada Seller Center, WooCommerce

---

### What Was Implemented (2026-05-22)

- **Expired Orders card** added to the Action Required section — shows count of pending unpaid
  orders older than 7 days, red border when count > 0, links to `/orders`
- **Dead links fixed** in `DashboardOverview.jsx` Action Required section
  (`/inventory` → `/inventory-v2`)
- **Action Required grid** expanded from 4 to 5 columns to accommodate the new card

---

### Full Redesign — Pending

---

### What Standard Ecommerce Dashboards Show (and Why)

Platforms like Shopify, Shopee, and Lazada all follow the same philosophy:
> **Give the business owner the most important number first, then let them drill down.**

The layout follows an F-pattern — eyes scan left-to-right across the top (KPI cards), then
down the left side (main chart), then across again (secondary data). Everything above the fold
should answer: "How is my business doing right now?"

---

### What the Big Platforms Show

| Section | Shopify | Shopee Seller | Lazada Seller |
|---------|---------|---------------|---------------|
| Top KPIs | Revenue, Orders, Avg Order Value, Visitors | Sales, Orders, Pending Ship, Cancellations | Revenue, Orders, Buyer count, Return rate |
| Main chart | Revenue over time (line) | Sales trend (line) | Revenue trend (line) |
| Secondary | Top products, Traffic sources | Product performance | Conversion funnel |
| Alerts | Low stock, Pending reviews | Unfulfilled orders | SLA violations |
| Recent | Recent orders | Recent orders | Recent orders |

**Common thread across all of them:**
1. Revenue first (the number that matters most)
2. Order counts by urgency (pending → needs action)
3. One big time-series chart (trend visibility)
4. Alerts/warnings (things that need action now)
5. Top products (what's selling)

---

### What PersonalizeMePrints Dashboard Should Show

This is a **custom print shop**, not a pure retail store. So the standard ecommerce dashboard needs
to be adapted. The key difference: production status and design workflow matter here in a way they
don't on Shopee or Lazada.

---

#### Row 1 — KPI Summary Cards (top, always visible)

These are the 6 numbers the owner looks at every morning:

| Card | Value | Why |
|------|-------|-----|
| **Today's Revenue** | ₱ total from Delivered orders today | Most important number |
| **Pending Orders** | Count of orders needing action | Queue awareness |
| **In Production** | Count of active Job Orders | Production load |
| **Design Approvals Pending** | Orders at `proof_sent` waiting customer response | Custom order flow |
| **Low Stock Alerts** | Count of materials below reorder point | Inventory health |
| **Unpaid / Partial** | Count of orders with outstanding balance | Cash flow |

Clicking a card filters or navigates to the relevant module.

---

#### Row 2 — Main Chart: Revenue Over Time

- **Type:** Line chart
- **Default range:** Last 30 days
- **Toggle:** Daily / Weekly / Monthly
- **Data:** Sum of `totalAmount` from `Delivered` orders grouped by date
- **Why line chart:** Shows trend — is the business growing, flat, or declining?
- **Secondary line (optional):** Cost of goods (BOM material cost) overlaid — shows gross profit

This is the same as Shopify's "Sales over time" chart. It's the anchor of every ecommerce dashboard.

---

#### Row 3 — Three Side-by-Side Panels

**Panel A — Orders by Status (Donut Chart)**

Breakdown of all active orders by status:
- Pending / In Production / For Delivery / Delivered / Cancelled / Returned
- Shows at a glance if too many orders are stuck in one stage
- Same as Shopee's "Order Status Distribution"

**Panel B — Top 5 Products by Revenue (Horizontal Bar Chart)**

- Ranked by `lineTotal` sum from all Delivered orders in the selected period
- Shows which products are driving the business
- Revenue version is more useful for a print shop than unit count

**Panel C — Payment Status Breakdown (Donut)**

- Paid / Partial / Unpaid split of current active orders
- Helps owner see how much cash is still outstanding
- Critical for this shop since COD and partial payments are common

---

#### Row 4 — Alerts & Actions Panel

**Column 1 — Needs Action Now**
- Orders at `proof_sent` for 3+ days (customer hasn't responded)
- Orders at `awaiting_payment` for 2+ days (DP not paid)
- Rush orders due within 2 days
- Low stock materials (below reorder point)

**Column 2 — In Progress**
- Active Job Orders with target completion dates
- Orders where balance is due but not yet overdue

**Column 3 — Recently Completed**
- Last 5 delivered orders
- Last 5 payments recorded

---

#### Row 5 — Inventory Health (Materials)

- **Bar chart:** Current stock level vs reorder point for the top 10 materials
- **Red bar = below reorder point** (needs restocking)
- **Color scale:** Green (healthy) → Yellow (watch) → Red (critical)

---

### Layout Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Today's Revenue  │ Pending Orders │ In Production │ Low Stock  │
│  ₱ X,XXX          │ XX orders      │ XX JOs        │ X items    │
│  Design Pending   │ Unpaid/Partial │ Expired Orders │           │
│  XX orders        │ XX orders      │ XX orders     │            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Revenue Over Time — Last 30 Days (Line Chart)                  │
│  ___/\___/\_____/\___                                           │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────┬───────────────────┬─────────────────────────┐
│ Orders by Status  │ Top 5 Products    │ Payment Status          │
│ (Donut)           │ (Horizontal Bar)  │ (Donut)                 │
└───────────────────┴───────────────────┴─────────────────────────┘

┌───────────────────┬───────────────────┬─────────────────────────┐
│ Needs Action Now  │ In Progress       │ Recently Completed      │
│ - Overdue designs │ - Active JOs      │ - Last 5 delivered      │
│ - Unpaid DPs      │ - Pending balance │ - Last 5 payments       │
│ - Rush orders     │                   │                         │
└───────────────────┴───────────────────┴─────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Material Stock Health (Bar Chart)                              │
│  [Material A ████████░░] [Material B ███░░░░░░░] ...           │
└─────────────────────────────────────────────────────────────────┘
```

---

### What NOT to Include (and Why)

| Feature | Reason to exclude |
|---------|------------------|
| Visitor / traffic analytics | No storefront tracking set up; Google Analytics handles this |
| Conversion rate funnel | Not enough data model to compute cart → order conversion |
| Customer lifetime value | Needs more order history; add later when data matures |
| SSA Forecast chart | Already exists as its own module — do not duplicate here |
| Per-product profit margin | Complex — needs full COGS from BOM; Phase 2 feature |

---

### Data Sources

All data comes from existing collections — no new models needed for Phase 1:

| Dashboard element | Source |
|------------------|--------|
| Revenue over time | `orders` collection, `orderStatus = Delivered`, group by `createdAt` |
| Orders by status | `orders` collection, group by `orderStatus` |
| Top products | `orders.items`, group by `productName`, sum `lineTotal` |
| Payment status | `orders` collection, group by `paymentStatus` |
| Low stock alerts | `inventories` collection, `stockQty <= reorderPoint` |
| Active Job Orders | `joborders` collection, `joStatus = In Progress` |
| Design pending | `orders` collection, `orderStatus = proof_sent` |

---

### Implementation Plan (Remaining)

#### Phase 1 — Replace current dashboardoverview with new layout 📋 Pending

- New KPI cards (replace existing ones with the 6 above)
- Revenue line chart (recharts or Chart.js — reuse same library as SSA)
- Orders by status donut
- Alerts panel (static calculation, no new API needed)

**Effort:** Medium-High — mostly frontend, new chart components

**Files:**
- `frontend/app/dashboard/business/dashboardoverview/page.jsx` — full rewrite
- `frontend/app/dashboard/business/dashboardoverview/DashboardOverview.jsx` — full rewrite
- New chart components (reuse chart library already present for SSA)

#### Phase 2 — Material stock chart + top products bar 📋 Pending

- Material health bar chart (needs inventory API data)
- Top products chart (needs orders aggregation endpoint)

**Effort:** Medium — one new backend aggregation endpoint + two chart components

**Files:**
- `backend/app/Http/Controllers/DashboardController.php` — new aggregation endpoints
- `backend/routes/api.php` — register new routes

#### Phase 3 — Date range filter + period comparison 📋 Pending (Low priority)

- Date range picker (Today / 7 days / 30 days / Custom)
- Period-over-period comparison (e.g. "Up 12% vs last month")

**Effort:** Low — parameter pass-through to existing queries

---

---

## Proposal 4 — Customer Order History & Details Redesign

**Status:** 🔄 Phase 1 Done — Phase 2 Pending  
**Files:** `frontend/app/shop/orders-history/page.jsx`

---

### Phase 1 — Implemented (2026-05-22 → 2026-05-25)

#### Bugs Fixed

| Bug | Description | Fix |
|-----|-------------|-----|
| Bug 1 | Item summary showed "+N more" for same-product orders | Now shows `ProductName ×N`, groups by productName |
| Bug 2 | "Down Payment" label showed even when fully paid | Gated by `requiresDownpayment && downPayment > 0` |
| Bug 3 | Cancel button appeared for non-cancellable statuses | Now shows only when `orderStatus === 'Pending'` |
| Bug 4 | Cancel copy didn't mention DP is non-refundable | Conditionally shows DP warning when `requiresDownpayment && downPayment > 0` |
| Bug 5 | "Pay Now" appeared for already-paid or COD orders | Now gated by `paymentStatus !== 'paid'` + valid statuses |
| Bug 6 | DP toggle appeared even when product didn't support DP | Gated by `requiresDownpayment` |

#### Enhancements

- **Header subtitle removed** ("Track and manage your regular and custom orders" was redundant)
- **Thumbnail** on order list cards (52×52px, +N badge for multiple items)
- **`STATUS_ACCENT` map** completed for all 20+ custom order statuses
- **Status badge redesign** — 3-tier semantic system:

| Tier | Color | When |
|------|-------|------|
| Active / in-progress | `#d4a843` gold | Pending, In Production, For QC, all custom in-progress |
| Needs customer action | `#f59e0b` amber | proof_sent, revision_requested |
| Success | `#22c55e` green | Delivered, Paid, Completed |
| Negative | `#ef4444` red | Cancelled, Returned |

- **`StatusBadge` in `shopUtils.js`** — added border, tightened padding, added letter-spacing
- **Admin `STATUS_CFG`** converted from rainbow → same 3-tier semantic system
- **Modal theme-responsive** — all CSS variables properly applied so modal responds to light/dark
  theme toggle. In light mode: `#ffffff` section cards on `#f5f7fa` modal bg (matches catalog/
  inventory). In dark mode: `#1a1a1a` section cards on `#222` modal bg.

#### Root cause of the earlier rendering issue

`custom-styles.css` has `html.light` overrides: `--dark2 → #f5f7fa`, `--white → #111827`,
`--border → rgba(0,0,0,0.1)`. ThemeContext defaults to `'light'`, so CSS variables respond to
the theme toggle correctly. The modal now uses proper CSS variables throughout (not hardcoded hex)
so it renders correctly in both modes.

---

### Phase 2 — Pending 📋

#### Modal Layout — 2-Column Standardization

Current layout has sections stacked vertically in a single scroll. Standard (Shopee/Lazada/Shopify)
splits into two columns: order info + tracking on the left, items + pricing on the right.

Proposed left column: Order Progress tracker, Order Info, Delivery Address, Shipment, Production, Review  
Proposed right column: Items list, Pricing breakdown, Pay Now section

**Effort:** Medium — layout restructure, no logic changes

#### Dedicated Order Page `/shop/orders/[id]`

- Route: `/shop/orders/[id]`
- Clicking an order card navigates to this page instead of opening a modal
- Full-screen layout, mobile-friendly, deep-linkable
- The modal becomes a fallback for quick-preview hover

**Effort:** Medium — new page component, extract modal content, update router

**Files:**
- `frontend/app/shop/orders/[id]/page.jsx` — new
- `frontend/app/shop/orders-history/page.jsx` — update card onClick to use router

---

---

## Proposal 5 — Design Agreement & Terms Flow

**Status:** 📋 Pending  
**Priority:** 🔴 High — legal and business risk without this  
**Related:** Proposal 2 (Timeout system — DP non-refundable policy), Proposal 6 (JO module)

---

### Problem: No Formal Customer Consent on Design Approval

Currently, when a customer clicks "Approve Design" in the order detail modal, the action is
processed with a single tap. There is:
- No confirmation that the customer actually read the design
- No formal acknowledgment that they accept the terms
- No record the store owner can reference in a dispute

If a customer later disputes the final product ("the text was wrong," "the colors were off"),
the business has **no legal record of explicit consent**. A boolean `approved: true` in a
database is not a legally defensible agreement.

**This is the gap.** The proposal below follows what custom print shops, design agencies, and
print-on-demand platforms use to protect both parties.

---

### What "Agreement" Actually Means Here

Not a full legal contract. A **digitally recorded, timestamped, explicit consent** to 5 specific
conditions — stored permanently on the order record and emailed to the customer as proof.

The standard for this type of consent (used by Canva, Vistaprint, custom print studios) is:

1. **Forced read** — customer must scroll through the terms before the Agree button unlocks
2. **Electronic signature** — customer types their name to confirm (same legal weight as a checkbox
   under Philippine e-commerce law / RA 8792)
3. **Server-side record** — the full text of what they agreed to is stored on the order at the
   time of signing (not just a version number)
4. **Email confirmation** — customer receives a copy, creating a second external record

---

### 3 Points of Agreement in the Order Flow

---

#### Point 1 — Design Proof Approval (Critical)

**Trigger:** Customer clicks "Approve Design" in the order detail modal  
**Current behavior:** One click → `designStatus: 'approved'` — no record, no reading  
**Proposed behavior:** Gated agreement modal with forced scroll + name entry

**UX flow:**

```
Customer clicks "Approve Design"
        ↓
Agreement modal opens:
┌───────────────────────────────────────────────────────────┐
│  DESIGN APPROVAL AGREEMENT                                │
│  Order #AC05DFD3 · Scrunchie ×2                          │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │ 1. FINAL DESIGN CONFIRMATION                     │   │
│  │    The design as shown in the proof is exactly   │   │
│  │    what will be printed. Please review all text, │   │
│  │    layout, colors, and sizing carefully before   │   │
│  │    approving.                                    │   │
│  │                                                   │   │
│  │ 2. NO CHANGES AFTER APPROVAL                    │   │
│  │    Once you approve this design, no modifications│   │
│  │    can be made. Any redesign will require a new  │   │
│  │    order and additional charges.                 │   │
│  │                                                   │   │
│  │ 3. COLOR VARIATION                              │   │
│  │    Printed colors may vary slightly from what    │   │
│  │    you see on screen due to monitor calibration  │   │
│  │    and the nature of the printing process.       │   │
│  │                                                   │   │
│  │ 4. NON-REFUNDABLE ONCE IN PRODUCTION            │   │
│  │    Payment / downpayment is non-refundable once  │   │
│  │    production has begun on an approved design.   │   │
│  │                                                   │   │
│  │ 5. INTELLECTUAL PROPERTY                       │   │
│  │    You confirm you own or have rights to all     │   │
│  │    design elements submitted. PersonalizeMe      │   │
│  │    Prints is not liable for infringement.        │   │
│  │                        [ scroll to continue ↓ ] │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ← "I Agree" button LOCKED until scrolled to bottom      │
│                                                           │
│  After scrolling to bottom:                              │
│  ┌───────────────────────────────────────────────────┐   │
│  │  Type your full name to confirm:                 │   │
│  │  [ Juan dela Cruz _________________________ ]    │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  [ Cancel ]        [ I Agree & Approve Design ← locked ] │
│                       (unlocks when name entered)         │
└───────────────────────────────────────────────────────────┘
```

**On submit:**
- `designStatus` → `'approved'`
- `designAgreement` record written to the order (see data model below)
- Confirmation email sent to customer
- Admin sees agreement record in order detail

---

#### Point 2 — Design File Upload (Medium priority)

**Trigger:** Customer submits their own design (upload-design flow or re-upload after rejection)  
**Proposed behavior:** Single checkbox before submission

```
☐  I confirm I own or have the rights to use this design/image.
   PersonalizeMe Prints is not liable for any copyright infringement
   resulting from submitted materials.
```

**On submit:**
- `uploadAgreement: { agreedAt: Date, agreedByEmail: string }` stored on the order

---

#### Point 3 — Checkout Terms (Low priority)

**Trigger:** Customer places any order at checkout  
**Proposed behavior:** Implied consent — single line at the bottom of the checkout form

```
By placing this order you agree to our Terms & Conditions and Privacy Policy.
```

No extra click needed. Same pattern as Shopify, Lazada, Sheen. Standard e-commerce practice.

---

### Data Model — Order Record

New fields added to the `orders` collection when a design agreement is signed:

```json
"designAgreement": {
  "agreedAt":       "2026-05-25T14:34:00.000Z",
  "agreedByName":   "Juan dela Cruz",
  "agreedByEmail":  "customer@email.com",
  "termsVersion":   "1.0",
  "termsSnapshot":  "Full text of the 5 terms as shown to the customer...",
  "orderId":        "...",
  "orderRef":       "AC05DFD3"
}
```

**Why `termsSnapshot` (not just version number):**  
If the terms text is ever updated in the future, the store owner can still prove exactly what
*this* customer agreed to on *this* date — not what the current terms say. This is the legally
robust approach.

---

### Admin View — Order Detail Modal

When `designAgreement` exists on the order, the admin's order detail shows:

```
DESIGN AGREEMENT
✅  Signed by Juan dela Cruz
    May 25, 2026 · 2:34 PM
    Terms v1.0   [ View Agreement ]
```

Clicking **View Agreement** opens a read-only modal showing:
- Customer name, email, and timestamp
- The exact terms text they agreed to
- Order reference

---

### Automatic Confirmation Email (after agreement)

Triggered immediately when the customer submits the agreement.

**Subject:** `Design Approved — Order #AC05DFD3`

**Body includes:**
- Link to the approved design file
- Date and time of approval
- Summary of the 5 terms they agreed to
- "Keep this email as your record of approval."

This creates a **second external record** (email thread) independent of the database — useful
if there is ever a dispute about what was agreed to and when.

---

### What This Solves

| Problem | Solution |
|---------|---------|
| Customer skips reading terms | Forced scroll — Agree button stays locked |
| "I never agreed to that" claim | Typed full name = electronic signature |
| No record of exact terms agreed | `termsSnapshot` stores full text at time of signing |
| Admin can't find proof of agreement | Visible in order detail with View button |
| Customer needs their own record | Automatic confirmation email with terms summary |
| Future terms changes invalidate old records | Version + snapshot keeps historical record intact |

---

### What Is NOT Included (Intentionally Out of Scope)

| Feature | Why excluded |
|---------|-------------|
| PDF certificate generation | Not needed — email + database record is sufficient for SMB |
| IP address logging | Optional enhancement, not required for basic legal protection |
| Separate legal agreement page | Overkill — in-modal terms with scroll gate is the standard |
| Wet signature or notarization | Not required for this type of digital consent in PH |

---

### Implementation Plan

#### Phase 1 — Design Proof Approval Agreement (Frontend only)

- Gated agreement modal in `orders-history/page.jsx` — replaces the current
  single-click "Approve Design" flow
- Scroll detection on the terms container (listen for `scrollTop + clientHeight >= scrollHeight`)
- Name input validation (non-empty, reasonable length)
- On submit: POST to existing `PATCH /api/shop/orders/:id/approve-design` endpoint, but include
  `designAgreement` fields in the request body

**Backend:** Add `designAgreement` to the Order model `$casts` and save it when design is approved

**Effort:** Medium — new modal component, minor backend model change

**Files:**
- `frontend/app/shop/orders-history/page.jsx` — replace approve-design click handler
- `backend/app/Models/Order.php` — add `designAgreement` to fillable + casts
- `backend/app/Http/Controllers/Shop/OrderController.php` — save agreement fields

#### Phase 2 — Admin view + confirmation email

- Agreement record display in admin order detail modal
- View Agreement modal (read-only)
- Trigger email notification on design approval (Laravel Notification or Mailable)

**Effort:** Low-Medium — admin UI read-only display + email template

**Files:**
- `frontend/app/dashboard/business/orders/page.jsx` — read and display `designAgreement`
- `backend/app/Notifications/DesignApprovedNotification.php` — new email notification
- `backend/resources/views/emails/design-approved.blade.php` — email template

#### Phase 3 — Upload design agreement + checkout terms

- Checkbox on design upload form (orders-history + checkout)
- "By placing this order..." line on checkout

**Effort:** Low

---

### Terms Version Management

`termsVersion: "1.0"` is hardcoded in the frontend for now. If terms ever need to be updated:
1. Bump the version number (`"1.1"`, `"2.0"`) in the frontend constant
2. Update the terms text
3. All new agreements store the new version + new text
4. Old agreements retain their original snapshot

No backend version table needed for Phase 1 — the snapshot approach handles it.

---

---

## Proposal 6 — Job Order (JO) Module

**Status:** 📋 Pending  
**Priority:** 🔴 High — required for production workflow of custom orders  
**Related:** P5 (Design Agreement — must be done before JO, since agreement gates production start)

---

### Context

After a custom order reaches `awaiting_production` (design approved + payment confirmed), the
production team needs a **Job Order** — a document that tells them exactly what to make, with
what materials (BOM), using which design files.

Currently there is no UI for this. The admin has no way to formally hand off a custom order
to production.

---

### Flow

```
Custom Order placed
        ↓
Admin uploads design proof
        ↓
Customer reviews → signs Design Agreement (P5) → approves
        ↓
Payment confirmed → orderStatus: 'awaiting_production' (auto, already implemented backend)
        ↓
Admin clicks "Produce JO" in order detail     ← THIS IS WHAT'S MISSING
        ↓
JO created:
  - Design file(s) attached (customer upload OR admin draft)
  - BOM auto-populated from product's linked BOM
  - joStatus: 'Queued'
        ↓
Production team views JO, starts work → joStatus: 'In Progress'
        ↓
Production done → joStatus: 'Completed' → orderStatus: 'For QC'
```

---

### What Needs to Be Built

#### 1. "Produce JO" Button

**Location:** Admin order detail modal, visible when `orderStatus === 'awaiting_production'`

**On click:** Opens JO creation form/modal with:
- Design file viewer (shows customer-uploaded design OR admin draft)
- BOM line items (auto-populated from the product's linked BOM template)
- Target completion date picker
- Assigned team member (optional)
- Notes field

---

#### 2. JO Creation — BOM Auto-Population

When the JO form opens, query the product's linked BOM and pre-fill the materials list:

```
Product: Inner Color Mug (×15)
─────────────────────────────
Material               Qty Needed    In Stock
Inner Color Mug        15            42  ✅
Mug Box                15            30  ✅
Sublimation Paper      10 sheets     5   ⚠️ Low
```

If any material is below the required quantity, show a warning before the JO is confirmed.

---

#### 3. JO Module Page

- Route: `/dashboard/business/job-orders`
- Table of all JOs with: JO ID, linked Order ID, product, status, target date, assigned to
- Click to expand: full BOM, design files, status update controls
- Accessible to production team role (not just admin)

---

#### 4. Production Team Access Role

Currently only admin has access to the dashboard. The JO module needs a `production` role:
- Can view and update Job Orders
- Cannot see financial data (order totals, payment info)
- Cannot cancel or refund orders

---

### Status Auto-Transitions (Already Implemented Backend — 2026-05-02)

| Trigger | Old Status | New Status |
|---------|-----------|-----------|
| Payment confirmed (webhook + verifyIntent) | `awaiting_payment` | `awaiting_production` |
| Admin uploads design draft | `pending_design` | `proof_sent` |
| Admin re-uploads after revision | `revision_requested` | `proof_sent` |

These backend transitions already exist. The UI (Produce JO button, JO form) is what's missing.

---

### Implementation Plan

#### Phase 1 — "Produce JO" button + JO creation form

**Effort:** Medium-High

**Files:**
- `frontend/app/dashboard/business/orders/page.jsx` — add Produce JO button + JO modal
- `backend/app/Http/Controllers/JobOrderController.php` — JO creation endpoint
- `backend/app/Models/JobOrder.php` — ensure `designFiles`, `bomItems`, `targetCompletion` are in fillable

#### Phase 2 — JO module page + production team role

**Effort:** Medium

**Files:**
- `frontend/app/dashboard/business/job-orders/page.jsx` — new JO list page
- `backend/app/Http/Middleware/` — production role guard
- `backend/routes/api.php` — production-accessible routes

---

---

*Last updated: 2026-05-25*  
*Stack: Next.js 15 App Router (frontend) · Laravel + MongoDB (backend)*  
*Do not touch: SSA (Singular Spectrum Analysis) module — ever*
