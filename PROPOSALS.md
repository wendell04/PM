# PersonalizeMePrints — Dev Proposals

---

## Proposal 1 — Dashboard Overview Dead Links (Quick Fix)

**Status:** Pending implementation  
**Effort:** 2-line change

Two links in `dashboardoverview` point to `/dashboard/business/inventory/returns` which was the old
inventory route (now deleted). The replacement is `inventory-v2` which already has Returns and
Bad Orders as built-in tabs.

**Files to update:**
- `frontend/app/dashboard/business/dashboardoverview/page.jsx` — line 20
- `frontend/app/dashboard/business/dashboardoverview/DashboardOverview.jsx` — line 739

**Change:** `/dashboard/business/inventory/returns` → `/dashboard/business/inventory-v2`

---

## Proposal 2 — Order Timeout / Expiration System

**Status:** Pending — implement in 3 phases  
**Adviser input:** Included  
**Related:** Design approval flow, payment flow, soft-delete (archive) system

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

### Implementation Plan

#### Phase 1 — Visual Indicators + Manual Admin Actions *(do this first)*

No scheduler. Pure UI.

- `⏰ X days waiting` badge on overdue orders in the admin table
- Manual **Cancel** / **Archive** button appears on the expanded row when threshold is reached
- Calculated from `updatedAt` of the relevant status change
- New Order fields: `timeoutWarningAt` (when last reminder was sent)

**Effort:** Medium — frontend UI change + minor backend field add

---

#### Phase 2 — Automated Notifications *(after Phase 1 is stable)*

Laravel scheduled job (`php artisan schedule:run` — runs daily).

- Checks all orders in timeout-eligible states
- Sends in-app + email reminders at the configured day marks
- Logs `timeoutWarningAt` on the order so reminders don't repeat
- Does NOT auto-cancel — admin still makes the final decision

**Effort:** Medium — Laravel scheduler + notification logic

---

#### Phase 3 — Configurable Durations *(optional)*

Settings page in admin dashboard.

- Admin sets reminder and action thresholds per stage
- Defaults baked in (values from the table above)
- Toggle: enable/disable the timeout system entirely
- Toggle: auto-cancel vs manual-only

**Effort:** Low — settings model + UI inputs

---

### Files That Will Be Touched

**Backend:**
- `backend/app/Models/Order.php` — add `timeoutWarningAt` to `$casts`
- `backend/app/Http/Controllers/OrderController.php` — timeout check logic
- `backend/app/Console/Commands/CheckOrderTimeouts.php` — new scheduled command (Phase 2)
- `backend/app/Console/Kernel.php` — register schedule (Phase 2)

**Frontend:**
- `frontend/app/dashboard/business/orders/page.jsx` — overdue badge + action buttons
- `frontend/lib/ordersApi.js` — no changes needed (uses existing archive/cancel endpoints)

---

---

## Proposal 3 — Admin Dashboard Redesign

**Status:** Pending — design + implementation  
**Do not touch:** SSA (Singular Spectrum Analysis) module — leave as-is  
**Reference:** Shopify, Shopee Seller Center, Lazada Seller Center, WooCommerce

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
- Shopify calls this "Top products by units sold" — revenue version is more useful for a print shop

**Panel C — Payment Status Breakdown (Stacked Bar or Donut)**

- Paid / Partial / Unpaid split of current active orders
- Helps owner see how much cash is still outstanding
- Not standard on Shopee/Lazada (they handle payments automatically) but critical for this shop
  since COD and partial payments are common

---

#### Row 4 — Alerts & Actions Panel (the most important for a custom shop)

This is what separates this dashboard from a generic ecommerce one. Three alert columns:

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

Because PersonalizeMePrints uses a BOM system, material stock directly affects order capacity.

- **Bar chart:** Current stock level vs reorder point for the top 10 materials
- **Red bar = below reorder point** (needs restocking)
- **Color scale:** Green (healthy) → Yellow (watch) → Red (critical)
- This is NOT standard on Shopee/Lazada because they don't manage raw materials
- But for a production-based shop, this is as important as the revenue chart

---

### Layout Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Today's Revenue  │ Pending Orders │ In Production │ Low Stock  │
│  ₱ X,XXX          │ XX orders      │ XX JOs        │ X items    │
│  Design Pending   │ Unpaid/Partial │               │            │
│  XX orders        │ XX orders      │               │            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Revenue Over Time — Last 30 Days (Line Chart)                  │
│                                                                 │
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

### Implementation Plan

#### Phase 1 — Replace current dashboardoverview with new layout

- New KPI cards (replace existing ones with the 6 above)
- Revenue line chart (recharts or Chart.js — already used in SSA, reuse the same library)
- Orders by status donut
- Alerts panel (static calculation, no new API needed)

**Effort:** Medium-High — mostly frontend, new chart components

#### Phase 2 — Add material stock chart + top products bar

- Material health bar chart (needs inventory API data)
- Top products chart (needs orders aggregation endpoint)

**Effort:** Medium — one new backend aggregation endpoint + two chart components

#### Phase 3 — Date range filter + period comparison

- Date range picker (Today / 7 days / 30 days / Custom)
- Period-over-period comparison (e.g. "Up 12% vs last month")

**Effort:** Low — parameter pass-through to existing queries

---

### Files That Will Be Touched

**Backend:**
- `backend/app/Http/Controllers/DashboardController.php` — new aggregation endpoints
- `backend/routes/api.php` — register new routes

**Frontend:**
- `frontend/app/dashboard/business/dashboardoverview/page.jsx` — full rewrite
- `frontend/app/dashboard/business/dashboardoverview/DashboardOverview.jsx` — full rewrite
- New chart components (reuse chart library already present for SSA)

---

---

## Proposal 4 — Customer Order History & Order Details Redesign

**Status:** Pending  
**Files:** `frontend/app/shop/orders-history/page.jsx`  
**Do not touch:** SSA module

---

### What's Wrong Right Now (Bugs + Design Issues)

#### Bug 1 — Product name still shows "+N more" (same bug as admin, different file)
Line 775–776 in `orders-history/page.jsx` has its own item summary logic:
```js
const firstName = items[0].productName + (items[0].variantName ? ` — ${items[0].variantName}` : '');
const itemSummary = items.length > 1 ? `${firstName} +${items.length - 1} more` : firstName;
```
This is independent from `normalizeOrder()`. So even after fixing the admin side, the customer
still sees "Scrunchie — Yellow +1 more" instead of "Scrunchie ×2". Same fix needed:
- If all items are the same product → show `ProductName ×N`
- If different products → show `FirstProduct +N more`

#### Bug 2 — "Down Payment" label shown even when fully paid
The order detail modal shows "Down Payment: ₱198.05" even when the order is 100% paid.
"Down Payment" implies partial payment. When the order is fully paid it should say "Amount Paid"
or just be included in the payment breakdown as "Paid in full".

#### Bug 3 — Cancel Order button shows for non-cancellable statuses
The Cancel button appears even when status is "Processing". Standard rule:
customers can only cancel when status is `Pending`. Once it moves to Processing, production
may have already started.

#### Design Issue — Orders page and modal don't match the shop theme
The shop nav and product pages use the dark brand theme (`var(--dark2)`, `var(--gold)`,
dark backgrounds). But the order history page has a **plain white/light gray background** and
the order detail modal has a **light gray card** — completely off-brand.
The CSS variables are used in the order cards but the page wrapper and modal shell
are not picking up the dark background.

---

### What Standard Platforms Do (Shopee / Lazada / Shopify)

**Order List page:**

| Element | Shopee | Lazada | What to apply here |
|---------|--------|--------|--------------------|
| Product thumbnail | ✅ Small image per item | ✅ | Add thumbnail to list card |
| Product name | Full name, no truncation | Full name | Fix +N more bug |
| Status | Badge, top right | Badge | Already done |
| Total | Bottom right, prominent | ✅ | Already done |
| Action hint | "Review proof ›" for pending actions | ✅ | Already exists, keep |
| Item count | "2 items" label | "2 items" | Add this |

**Order Detail — key standard:**

Shopee and Lazada both moved from modal to **dedicated page** (`/shop/orders/{id}`).
Reasons:
1. Mobile — a full-screen page is easier to scroll and interact with than a modal
2. Deep-linkable — customer can share/bookmark a specific order
3. Less overwhelming — modals over a list feel claustrophobic with all the detail content

However, given this is a web-first shop and the modal already has good content,
**the proposal is to keep the modal but fix it** and plan a dedicated page as a later upgrade.

---

### Proposed Changes

#### Fix 1 — Item summary logic (same product = ×N)
```js
// In orders-history/page.jsx, replace lines 775–776:
const names = items.map(i => i.productName || i.product_name || 'Product');
const uniqueNames = [...new Set(names)];
const totalQty = items.reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
let itemSummary;
if (items.length === 1) {
  const v = items[0].variantName || items[0].variant_name;
  itemSummary = names[0] + (v ? ` — ${v}` : '');
} else if (uniqueNames.length === 1) {
  itemSummary = `${uniqueNames[0]} ×${totalQty}`;
} else {
  itemSummary = `${uniqueNames[0]} +${uniqueNames.length - 1} more`;
}
```

#### Fix 2 — Payment label
In the detail modal, replace "Down Payment" label with:
- `paymentStatus === 'paid'` → show "Paid in Full" (green)
- `paymentStatus === 'partial'` → show "Down Payment" (gold)
- `paymentStatus === 'unpaid'` → don't show a paid amount line

#### Fix 3 — Cancel button guard
Show Cancel Order button only when `orderStatus === 'Pending'`.
```js
// Change: order.orderStatus !== 'Delivered' && order.orderStatus !== 'Cancelled'
// To:
order.orderStatus === 'Pending'
```

#### Fix 4 — Dark theme alignment
The page wrapper needs `background: var(--bg)` or `var(--dark)` (matching shop layout).
The modal shell (the white card) needs `background: var(--dark2)`, `color: var(--white)`,
`border: 1px solid var(--border)`.
All section labels, info text should use `var(--gray)` for secondary text,
`var(--white)` for primary text — matching the rest of the shop.

#### Enhancement — Add thumbnails to order list cards
Each order card in the list should show small stacked thumbnails (like Shopee).
```
[img][img]  Scrunchie ×2            Processing ›
            May 19, 2026            ₱198.05
```
Stack up to 3 thumbnails (24×24px), offset slightly, show +N if more.

#### Enhancement — "N items" label
Add "2 items" below or beside the product summary. Shopee always shows item count in the list.

---

### Layout Proposal — Order List Card (Improved)

```
┌──────────────────────────────────────────────────────────┐
│ ▌  #AC05DFD3              CUSTOM      [Processing]       │
│    May 19, 2026                       [Paid]             │
│ ─────────────────────────────────────────────────────── │
│  [🖼][🖼]  Scrunchie ×2 · 2 items     Review proof ›  ₱198.05 │
└──────────────────────────────────────────────────────────┘
```

The left accent bar color matches status (gold = active, green = delivered, red = cancelled).
Already implemented — keep it.

---

### Layout Proposal — Order Detail Modal (Improved)

```
┌─── ORDER DETAILS ─── #AC05DFD3 ─────────────────── [×] ─┐
│                                                           │
│  ── ORDER PROGRESS ──────────────────────────────────    │
│  [Placed]──●──[Processing]──○──[Delivery]──○──[Delivered] │
│  May 19                                                   │
│                                                           │
│  ── 2 ITEMS ──────────────────────────────────────────   │
│  [🖼] Scrunchie  Yellow    ×1   ₱45.00                   │
│  [🖼] Scrunchie  Orange    ×1   ₱45.00                   │
│                                                           │
│  ── PAYMENT ───────────────────────────────────────────  │
│  Subtotal                          ₱90.00                 │
│  Shipping                         ₱108.05                 │
│  ─────────────────────────────────────────               │
│  Total                            ₱198.05                 │
│  Paid in Full ✓                   ₱198.05  (green)       │
│                                                           │
│  ── ORDER INFO ────────────────────────────────────────  │
│  Placed      May 19, 2026                                 │
│  Method      GCash                                        │
│  Status      Processing                                   │
│                                                           │
│  ── DELIVERY ADDRESS ──────────────────────────────────  │
│  168 General Luis Street, Nagkaisang Nayon...             │
│                                                           │
│         [Buy Again]                    [Close]            │
└───────────────────────────────────────────────────────────┘
```

Key changes from current:
- Dark background to match shop theme
- "Down Payment" → "Paid in Full ✓" in green when fully paid
- Items moved above payment (Shopee/Lazada pattern — items first, then totals)
- Cancel Order button only shows when `Pending`
- Buy Again button stays for Delivered orders

---

### Future Upgrade — Dedicated Order Page

After the modal is fixed, the longer-term plan is:
- Route: `/shop/orders/[id]`
- Clicking an order card navigates to this page instead of opening a modal
- Full-screen layout, easier on mobile, deep-linkable
- The modal version becomes a fallback for quick preview

---

### Files to Touch

- `frontend/app/shop/orders-history/page.jsx` — all fixes above (lines 775–776 itemSummary, Cancel guard, dark theme, payment label)
- No backend changes needed

---

*Last updated: 2026-05-22*  
*Session context: This proposal was discussed after implementing soft-delete/archive for orders,*  
*fixing the cancel-order BOM stock restore bug, and consolidating OrderQuickViewModal into the*  
*expandable order row. Screenshots reviewed: orders-history list page and order detail modal.*
