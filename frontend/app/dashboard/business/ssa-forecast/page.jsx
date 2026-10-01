"use client";

import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { businessDate, businessToday } from "@/lib/businessDate";
import { CustomSelect, ICONS, SummaryCard, TabBar } from "../inventory-v2/shared";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  Brush,
  ComposedChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SSA_API_URL =
  process.env.NEXT_PUBLIC_SSA_API_URL || "http://localhost:8001";

const FORECAST_PERIODS = [
  {
    label: "Weekly",
    type: "weekly",
    unit: "weeks",
    tableHeader: "Week",
    maxCount: 52,
  },
  {
    label: "Monthly",
    type: "monthly",
    unit: "months",
    tableHeader: "Month",
    maxCount: 12,
  },
  {
    label: "Annually",
    type: "annually",
    unit: "years",
    tableHeader: "Year",
    maxCount: 3,
  },
];

const DEFAULT_COUNTS = { weekly: 4, monthly: 3, annually: 2 };

const RFM_COLORS = {
  "Champions":           { bg: "var(--st-green-bg)",  color: "var(--st-green-fg)" },
  "Loyal Customers":     { bg: "var(--st-blue-bg)",  color: "var(--st-blue-fg)" },
  "Potential Loyalists": { bg: "var(--st-purple-bg)", color: "var(--st-purple-fg)" },
  "New Customers":       { bg: "var(--rfm-new-bg)",  color: "var(--rfm-new-fg)" },
  "Promising":           { bg: "var(--st-amber-bg)",  color: "var(--st-amber-fg)" },
  "At Risk":             { bg: "var(--st-orange-bg)",  color: "var(--st-orange-fg)" },
  "Can't Lose Them":     { bg: "var(--st-red-bg)", color: "var(--st-red-fg)" },
  "Hibernating":         { bg: "var(--st-gray-bg)", color: "var(--st-gray-fg)" },
  "Lost":                { bg: "var(--rfm-lost-bg)", color: "var(--rfm-lost-fg)" },
  "Need Attention":      { bg: "var(--gold-subtle)",  color: "var(--gold)" },
};

const SEGMENT_DESC = {
  "Champions":           "Buy very recently, very often, and spend the most. Reward them - they drive the most revenue.",
  "Loyal Customers":     "Buy regularly and spend well. Keep them engaged with exclusive offers.",
  "Potential Loyalists": "Bought recently with growing frequency. Nurture them to become loyal.",
  "New Customers":       "Made their first purchase recently. Onboard them with a good experience.",
  "Promising":           "Active but spending below average. Upsell opportunities.",
  "At Risk":             "Used to buy often but have gone quiet. Send a win-back campaign now.",
  "Can't Lose Them":     "High purchase frequency but absent recently. High-value churn risk.",
  "Hibernating":         "Low frequency, haven't bought in a while. Re-engage with a discount.",
  "Lost":                "Lowest scores across all dimensions - likely churned.",
  "Need Attention":      "Moderate scores; inconsistent behavior. Need targeted follow-up.",
};

const ABC_DESC = {
  A: { label: "Best sellers - top 70% of revenue",  tip: "Protect these. Prioritize stock, quality, and promotion." },
  B: { label: "Steady - next 20%",                  tip: "Grow these. Small improvements here have outsized returns." },
  C: { label: "Low performers - the rest",          tip: "Review these. Consider bundling, discounting, or phasing out." },
};

function AnalyticsSkeleton() {
  return (
    <div>
      <div className="ssa-metrics-grid">
        {[1,2,3,4].map(i => (
          <div key={i} style={{ background:"var(--dark)", border:"1px solid var(--border)", borderRadius:"8px", padding:"14px 18px" }}>
            <div className="ssa-skeleton" style={{height:"12px",width:"55%",marginBottom:"12px"}} />
            <div className="ssa-skeleton" style={{height:"24px",width:"35%"}} />
          </div>
        ))}
      </div>
      <div className="ssa-card">
        <div className="ssa-skeleton" style={{height:"16px",width:"28%",marginBottom:"20px"}} />
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{display:"flex",gap:"24px",marginBottom:"12px",alignItems:"center"}}>
            <div className="ssa-skeleton" style={{height:"12px",flex:"2"}} />
            <div className="ssa-skeleton" style={{height:"12px",flex:"1"}} />
            <div className="ssa-skeleton" style={{height:"12px",flex:"1"}} />
            <div className="ssa-skeleton" style={{height:"12px",flex:"1"}} />
          </div>
        ))}
      </div>
    </div>
  );
}

const DATA_SOURCES = [
  { key: "sales_revenue", label: "Sales Revenue" },
  { key: "sales_qty", label: "Sales Quantity" },
  { key: "inventory_stock", label: "Inventory Stock Level" },
];

/**
 * Turn a thrown fetch error into something the reader can act on.
 *
 * Every tab on this page posts to the SSA service, which runs separately from
 * the rest of the dashboard. When it is not running the browser throws a bare
 * TypeError - "Failed to fetch" - with no clue that a second service exists or
 * that the rest of the app is fine. That message was the whole error the user
 * saw on all four tabs at once.
 */
function originLabel() {
  return typeof window !== "undefined" ? window.location.origin : "this site";
}

function describeForecastError(err, ssaUrl) {
  if (err?.name === "AbortError") {
    return `The forecast service did not answer in time. Check that it is running at ${ssaUrl}.`;
  }
  // A network-level failure: service down, wrong host, or blocked by CORS.
  // Fetch reports all three identically, so the advice has to fit the host.
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err?.message ?? "")) {
    // WHICH service failed. This page loads sales from the dashboard API before
    // it posts anything to SSA, and both calls sat in one try whose catch always
    // named SSA. A blocked dashboard API therefore read as "could not reach the
    // forecast service at <ssa host>" - sending the search after a host that was
    // healthy, while the call that actually failed went unnamed. apiFetch tags
    // its rejections so the message can tell the two apart.
    const failed = err?.service;
    if (failed?.kind === "api") {
      return `Could not reach the dashboard API at ${failed.url}. This is the call that loads sales history - the forecast service is a separate host and may well be fine. Check the API is up and that its allowed origins include ${originLabel()}.`;
    }
    let isLocal = false;
    try {
      isLocal = ["localhost", "127.0.0.1"].includes(new URL(ssaUrl).hostname);
    } catch { /* malformed URL - treat as remote */ }
    return isLocal
      ? `Could not reach the forecast service at ${ssaUrl}. It runs separately from the dashboard - start it with "uvicorn main:app --port 8001" in ssa-service, then run the forecast again.`
      // Telling someone to run uvicorn is useless when the service is hosted;
      // for a remote host the causes are that it is down or that this page's
      // origin is not on its allow-list.
      : `Could not reach the forecast service at ${ssaUrl}. Either it is not responding, or this site's address is not on its allowed list - check the service is up and that SSA_ALLOWED_ORIGINS includes ${originLabel()}.`;
  }
  return err?.message || "An unexpected error occurred.";
}

/**
 * fetchWithTimeout against the dashboard API, with the failure labelled.
 *
 * Only tags network-level rejections; everything else passes through unchanged.
 */
async function apiFetch(url, options, timeout) {
  try {
    return await fetchWithTimeout(url, options, timeout);
  } catch (err) {
    if (err && typeof err === "object" && !err.service) {
      err.service = { kind: "api", url: API_URL };
    }
    throw err;
  }
}

/**
 * A response the page can trust to hold JSON rows.
 *
 * The sales and history reads went straight to res.json() with no status check,
 * so an expired session (401) parsed fine, yielded no array, and surfaced as
 * "Not enough data points" - which reads like a data problem rather than a
 * sign-in one.
 */
function requireOk(res, what) {
  if (res.ok) return res;
  if (res.status === 401 || res.status === 419) {
    throw new Error("Your session has expired. Sign in again, then run the forecast.");
  }
  if (res.status === 403) {
    throw new Error(`You do not have permission to read ${what}.`);
  }
  throw new Error(`Could not load ${what} (HTTP ${res.status}).`);
}


/**
 * Turn sales of finished products into demand for one raw material.
 *
 * No sale in the collection carries an inventoryId, so the link runs
 * sale -> product (+ variant) -> bill of materials -> material, with the
 * per-unit quantity from the BOM applied on the way through.
 *
 * Where the stock ledger reaches, it wins: it records the actual deduction
 * per material with the recipe already applied. The sales route is what
 * covers the years before the ledger existed, and afterwards it serves as a
 * cross-check rather than as the input.
 *
 * Three allocation rules for the sales route, in order of how much they assume:
 *
 *   exact     the material is used by every variant at the same rate, so the
 *             variant a legacy sale didn't record makes no difference
 *   share     the sale names no variant and recent orders are numerous enough
 *             to say how the family splits
 *   even      same, but too few recent orders to trust a split - divided
 *             evenly and labelled as an assumption rather than dropped, since
 *             dropping it would throw away three years of history
 */
function buildMaterialDemand(inventoryId, taxonomy, sales, ledger = []) {
  const entry = taxonomy?.materialIndex?.[inventoryId];
  if (!entry) return { rows: [], linked: false, basis: null };

  const variantNamesFor = (productId) =>
    (taxonomy.motherItems ?? []).find((m) => m.productId === productId)?.variants ?? [];
  const variantCountFor = (productId) => variantNamesFor(productId).length;

  // Per product, how does this material relate to that product's variants?
  const planByProduct = {};
  entry.consumers.forEach((c) => {
    (planByProduct[c.productId] ??= { covered: [], qty: c.qtyPerUnit, productName: c.productName }).covered.push(c);
  });

  const basis = { exact: 0, share: 0, even: 0, unmatched: 0, consumers: new Set() };

  const byDay = {};
  sales.forEach((s) => {
    // Sales written since the productId/variantName fix resolve directly; older
    // rows still go through the name map the taxonomy endpoint built.
    //
    // The direct path still has to pin the variant. OrderController writes the
    // combination label as the customer chose it - "Glossy · Diecut" - while
    // only one part of that names a BOM-bearing variant. The taxonomy pins
    // names it resolves; this path must do the same or a sale that carries the
    // new link is dropped for not matching any BOM line, which is exactly what
    // happened to the first seven-sheet sticker order.
    const r = s.productId
      ? {
          productId: String(s.productId),
          variant: pinVariantTo(s.variantName ?? null, variantNamesFor(String(s.productId))),
        }
      : taxonomy.saleResolution?.[s.productName];
    if (!r) { basis.unmatched += 1; return; }

    const plan = planByProduct[r.productId];
    if (!plan) return;

    const d = s.saleDate ? new Date(s.saleDate) : null;
    if (!d || isNaN(d)) return;
    const qty = s.quantity ?? 0;
    if (qty <= 0) return;

    const variantsOfProduct = variantCountFor(r.productId);
    const coversEveryVariant =
      variantsOfProduct === 0 ||
      plan.covered.some((c) => c.variantName == null) ||
      plan.covered.length >= variantsOfProduct;

    let units = 0;
    if (r.variant != null) {
      // The sale names its variant - take only the matching BOM line.
      const hit = plan.covered.find((c) => c.variantName == null || c.variantName === r.variant);
      if (hit) { units = qty * hit.qtyPerUnit; basis.exact += 1; }
    } else if (coversEveryVariant) {
      // Variant-independent: every variant draws on this material equally.
      units = qty * plan.covered[0].qtyPerUnit;
      basis.exact += 1;
    } else {
      const vs = taxonomy.variantShares?.[r.productId];
      if (vs?.sufficient) {
        plan.covered.forEach((c) => {
          units += qty * c.qtyPerUnit * (vs.shares?.[c.variantName] ?? 0);
        });
        basis.share += 1;
      } else if (variantsOfProduct > 0) {
        plan.covered.forEach((c) => {
          units += (qty * c.qtyPerUnit) / variantsOfProduct;
        });
        basis.even += 1;
      }
    }

    if (units <= 0) return;
    plan.covered.forEach((c) =>
      basis.consumers.add(c.variantName ? `${c.productName} · ${c.variantName}` : c.productName),
    );
    const ds = businessDate(d);
    byDay[ds] = (byDay[ds] ?? 0) + units;
  });

  const salesRows = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));

  // ── Prefer the stock ledger where it reaches ──────────────────────────────
  // The ledger records what was actually taken off the shelf, per material,
  // with the recipe quantity already applied. It only starts in Aug 2026, but
  // over the weeks it covers it is exact, and it is the current trading
  // regime. The sales series reaches back three years to a shop that sold a
  // twentieth of today's volume; averaging the two together reports a rate an
  // order of magnitude below what the shelf is actually losing.
  const ledgerRows = buildLedgerDemand(ledger);
  const useLedger = ledgerRows.length > 0;
  const rows = useLedger ? ledgerRows : salesRows;

  return {
    rows,
    linked: true,
    basis: {
      ...basis,
      consumers: Array.from(basis.consumers),
      shared: entry.shared === true,
      source: useLedger ? "ledger" : "sales",
      ledgerFrom: useLedger ? ledgerRows[0].date : null,
      // Sales x BOM over the same weeks should land near the ledger. When it
      // does not, something happened with no sale behind it - scrap, an
      // adjustment, or a recipe that no longer matches what is consumed.
      crossCheck: useLedger ? compareRates(ledgerRows, salesRows) : null,
      salesSpanRows: salesRows.length,
    },
  };
}

/**
 * Daily material demand straight from stock-ledger deductions.
 *
 * Not every deduction is consumption. The ledger records four reasons:
 *
 *   production     material used to make an order - always demand
 *   sale_reserved  a hold placed when a ready-made item is ordered. It is the
 *                  consumption event for stock that is sold as-is, but only if
 *                  the order went through; a cancelled order releases the hold
 *                  and the stock comes back. Counting those made 53 units of
 *                  phantom demand on two materials, every one of them a test
 *                  order cancelled the same week.
 *   qc_scrap       shrinkage, not demand
 *   damaged        shrinkage, not demand
 *
 * The history endpoint annotates each row with the order's normalised status
 * so this can be decided here without a second request.
 */
/**
 * Reduce a sale's variant label to one of the product's real combination
 * names. Mirrors ForecastTaxonomyController::pinVariant so the direct
 * productId path and the name-map path pin the same way.
 */
function pinVariantTo(variant, known) {
  if (variant == null || variant === "" || known.length === 0) return variant ?? null;
  const norm = (s) => String(s).trim().toLowerCase();
  const v = norm(variant);
  const exact = known.find((k) => norm(k) === v);
  if (exact) return exact;
  // Combination labels join variant groups with a middle dot or slash
  const parts = String(variant).split(/\s*[·•/,]\s*/).map(norm).filter(Boolean);
  for (const part of parts) {
    const hit = known.find((k) => norm(k) === part);
    if (hit) return hit;
  }
  // A shorthand against a fuller label ("Medium" vs "Medium (12x14\")")
  for (const part of parts) {
    const hit = known.find((k) => norm(k).startsWith(part));
    if (hit) return hit;
  }
  return variant;
}

function isConsumption(h) {
  const reason = h?.reason ?? "";
  if (reason === "production") return true;
  if (reason === "sale_reserved") {
    const st = h?.orderStatus ?? null;
    return st !== "cancelled" && st !== "returned";
  }
  return false;
}

function buildLedgerDemand(ledger) {
  if (!Array.isArray(ledger) || ledger.length === 0) return [];
  const byDay = {};
  ledger.forEach((h) => {
    if ((h?.type ?? "") !== "deduction") return;
    if (!isConsumption(h)) return;
    const d = h.createdAt ? new Date(h.createdAt) : null;
    if (!d || isNaN(d)) return;
    const qty = Math.abs(Number(h.quantity ?? 0));
    if (!(qty > 0)) return;
    const ds = businessDate(d);
    byDay[ds] = (byDay[ds] ?? 0) + qty;
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
}

/**
 * Weekly rate from each source over the window the ledger covers.
 *
 * The two sources date the same event differently: a sale carries the date
 * the order was placed, the ledger carries the date the material was taken
 * for production - a week apart in the data. Windowing sales to the ledger's
 * own dates therefore dropped every order placed before the first deduction,
 * and reported "sales 0" for seven materials whose sales were simply dated
 * earlier. The sales window opens PRODUCTION_LAG_DAYS before the ledger's.
 */
const PRODUCTION_LAG_DAYS = 14;

function compareRates(ledgerRows, salesRows) {
  if (ledgerRows.length === 0) return null;
  const from = ledgerRows[0].date;
  const to = ledgerRows[ledgerRows.length - 1].date;
  const salesFrom = new Date(new Date(from).getTime() - PRODUCTION_LAG_DAYS * 86400000)
    .toISOString().split("T")[0];
  // Each total is divided by ITS OWN window. Sales are summed from the production
  // lag before the ledger opens - material is consumed before the sale records -
  // but both used to be divided by the ledger's narrower span, so the sales rate
  // carried an extra fortnight of demand over the same number of weeks. Two
  // sources in perfect agreement came out 16.7% apart, close enough to the 25%
  // threshold below to raise a false "these disagree" on a shorter history.
  const weeksBetween = (a, b) =>
    Math.max(1, (new Date(b) - new Date(a)) / 604800000 + 1 / 7);
  const sum = (rs, lo) => rs.filter((r) => r.date >= lo && r.date <= to).reduce((s, r) => s + r.value, 0);
  const ledgerRate = sum(ledgerRows, from) / weeksBetween(from, to);
  const salesRate = sum(salesRows, salesFrom) / weeksBetween(salesFrom, to);
  const denom = Math.max(ledgerRate, salesRate);
  return {
    ledgerRate: Math.round(ledgerRate * 100) / 100,
    salesRate: Math.round(salesRate * 100) / 100,
    // Flag only a material difference, not rounding noise.
    diverges: denom > 0 && Math.abs(ledgerRate - salesRate) / denom > 0.25,
  };
}

const pageStyles = `
  /* Two RFM segments need a hue the status palette does not carry: green and
     gray already belong to Champions and Hibernating. Declared as tokens with
     a light override so they flip with the theme like every other chip, rather
     than staying dark-mode coloured on a light background. */
  :root {
    --ssa-tint:  rgba(255,255,255,0.03);
    --ssa-hover: rgba(255,255,255,0.05);
    --rfm-new-bg:  rgba(52,211,153,0.15);  --rfm-new-fg:  #34d399;
    --rfm-lost-bg: rgba(107,114,128,0.15); --rfm-lost-fg: #6b7280;
  }
  html.light {
    --ssa-tint:  rgba(0,0,0,0.025);
    --ssa-hover: rgba(0,0,0,0.045);
    --rfm-new-bg:  #e6f7f1;                --rfm-new-fg:  #0f766e;
    --rfm-lost-bg: #f3f4f6;                --rfm-lost-fg: #4b5563;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .ssa-spinner { animation: spin 1s linear infinite; }
  .ssa-skeleton {
    background: linear-gradient(90deg, var(--dark) 25%, rgba(255,255,255,0.04) 50%, var(--dark) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 6px;
    height: 32px;
    width: 70%;
  }
  .ssa-card {
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .ssa-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .ssa-card-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--white);
    margin: 0;
  }
  .ssa-filter-divider {
    width: 1px;
    height: 26px;
    background: var(--border);
    flex-shrink: 0;
    align-self: center;
  }
  .ssa-stat-label {
    font-size: 12px;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .ssa-stat-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--white);
  }
  .ssa-error {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--st-red-bg);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 6px;
    padding: 12px 16px;
    color: var(--st-red-fg);
    font-size: 14px;
    margin-top: 16px;
  }
  .ssa-info-banner {
    background: rgba(212,168,67,0.06);
    border: 1px solid rgba(212,168,67,0.2);
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 14px;
    color: var(--gray);
    line-height: 1.6;
  }
  .ssa-warning-banner {
    background: rgba(251,191,36,0.06);
    border: 1px solid rgba(251,191,36,0.25);
    border-radius: 6px;
    padding: 10px 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: var(--gray);
    line-height: 1.5;
  }
  .ssa-forecast-day-row:nth-child(even) {
    background: var(--ssa-tint);
  }
  /* Keyboard focus. The page had two focus styles for ~30 controls, so
     tabbing through it gave no sign of where you were. :focus-visible keeps
     the ring off mouse clicks. */
  .ssa-toggle-btn:focus-visible,
  .ssa-seg-btn:focus-visible,
  .ssa-icon-btn:focus-visible,
  .ssa-run-btn:focus-visible,
  .ssa-primary-btn:focus-visible,
  .ssa-export-btn:focus-visible,
  .ssa-select:focus-visible,
  .ssa-lookahead:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  .ssa-toggle-btn {
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--dark);
    color: var(--gray);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ssa-toggle-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-toggle-btn.active { background: rgba(212,168,67,0.12); border-color: var(--gold); color: var(--gold); }
  .ssa-select {
    padding: 8px 12px;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--white);
    font-size: 14px;
    outline: none;
    min-width: 200px;
  }
  .ssa-select:focus { border-color: var(--gold); }
  .ssa-tooltip {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
  }
  .ssa-tooltip-text {
    visibility: hidden;
    width: 240px;
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--gray);
    font-size: 12px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    padding: 10px 12px;
    position: absolute;
    z-index: 10;
    bottom: 130%;
    left: 50%;
    transform: translateX(-50%);
    line-height: 1.5;
    pointer-events: none;
  }
  .ssa-tooltip:hover .ssa-tooltip-text { visibility: visible; }
  .ssa-tab-nav {
    margin-top: 20px;
    margin-bottom: 24px;
  }
  .ssa-rfm-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
  }
  .ssa-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .ssa-table th {
    text-align: left;
    padding: 10px 14px;
    background: var(--dark2);
    border-bottom: 1px solid var(--border);
    color: var(--gray);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .ssa-table td {
    padding: 11px 14px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    color: var(--white);
    vertical-align: middle;
  }
  .ssa-table tbody tr:hover { background: var(--ssa-hover); }
  .ssa-metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 900px)  { .ssa-metrics-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px)  { .ssa-metrics-grid { grid-template-columns: 1fr; } }
  .ssa-run-btn {
    padding: 8px 18px;
    border-radius: 6px;
    border: 1px solid var(--gold);
    background: rgba(212,168,67,0.1);
    color: var(--gold);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ssa-run-btn:hover:not(:disabled) { background: rgba(212,168,67,0.2); }
  .ssa-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ssa-tbl-wrap { overflow: auto; scrollbar-width: none; }
  .ssa-tbl-wrap::-webkit-scrollbar { display: none; }
  .ssa-page-header {
    padding: 24px 0 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .ssa-page-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--white);
    margin: 0 0 4px;
    letter-spacing: -0.02em;
  }
  .ssa-alerts-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }
  .ssa-section-divider {
    height: 1px;
    background: var(--border);
    margin: 24px 0;
    opacity: 0.45;
  }

  /* ════════════ Demand Forecast - two-column workspace ════════════ */
  .ssa-layout {
    display: grid;
    grid-template-columns: 256px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .ssa-sidebar {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  /* Slim but visible. These panes scroll vertically on desktop, and with the
     track hidden nothing said more content sat below the fold. The dashboard
     hides scrollbars only on phones and only on horizontal strips. */
  .ssa-sidebar, .ssa-main {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .ssa-sidebar::-webkit-scrollbar,
  .ssa-main::-webkit-scrollbar { width: 8px; }
  .ssa-sidebar::-webkit-scrollbar-thumb,
  .ssa-main::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }

  /* ── Desktop: split into two independent scroll panes ──────────────────
     The whole forecast workspace fills the viewport (no page-level scroll);
     the left sidebar and the right results column each scroll on their own,
     so they no longer move together. */
  @media (min-width: 901px) {
    .page-content-wrapper {
      height: calc(100vh - 56px - 64px);   /* viewport − top-bar − page padding */
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ssa-page-header, .ssa-tab-nav { flex-shrink: 0; }
    .ssa-tab-nav { margin-bottom: 16px; }
    .ssa-layout {
      flex: 1;
      min-height: 0;
      align-items: stretch;          /* both columns fill the row height */
    }
    .ssa-sidebar, .ssa-main {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }
    .ssa-main { padding-right: 4px; }
    /* Customer Segments / Products tabs scroll inside their own pane too */
    .ssa-tab-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
      -ms-overflow-style: none;
    }
    .ssa-tab-scroll::-webkit-scrollbar { width: 8px; }
      .ssa-tab-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
  }
  @media (max-width: 900px) { .ssa-layout { grid-template-columns: 1fr; } }
  .ssa-side-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px;
  }
  .ssa-source-list { display: flex; flex-direction: column; gap: 6px; }
  .ssa-source-vbtn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--dark);
    color: var(--gray);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }
  .ssa-source-vbtn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-source-vbtn.active {
    background: var(--gold-subtle);
    border-color: var(--gold);
    color: var(--gold);
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .ssa-source-vbtn svg { flex-shrink: 0; }
  .ssa-segmented {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .ssa-seg-btn {
    flex: 1;
    padding: 8px 0;
    background: var(--dark);
    color: var(--gray);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    border-right: 1px solid var(--border);
    transition: all 0.15s;
  }
  .ssa-seg-btn:last-child { border-right: none; }
  .ssa-seg-btn:hover:not(.active) { color: var(--white); }
  .ssa-seg-btn.active { background: var(--gold); color: #1a1a1a; }
  .ssa-lookahead {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--dark);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .ssa-lookahead:focus-within { border-color: var(--gold); }
  .ssa-lookahead input {
    flex: 1;
    min-width: 0;
    padding: 10px 12px;
    background: transparent;
    border: none;
    color: var(--white);
    font-size: 16px;
    font-weight: 700;
    outline: none;
  }
  .ssa-lookahead .unit {
    padding: 0 12px;
    font-size: 13px;
    color: var(--gray);
    border-left: 1px solid var(--border);
    align-self: stretch;
    display: flex;
    align-items: center;
  }
  .ssa-side-hint { font-size: 11px; color: var(--gray); margin: 6px 0 0; }
  .ssa-primary-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px 18px;
    background: var(--gold);
    border: 1px solid var(--gold);
    border-radius: 6px;
    color: #1a1a1a;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ssa-primary-btn:hover:not(:disabled) { background: var(--gold-dark); border-color: var(--gold-dark); }
  .ssa-primary-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .ssa-model-info { display: flex; flex-direction: column; }
  .ssa-model-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .ssa-model-row:last-child { border-bottom: none; }
  .ssa-model-row .k { color: var(--gray); }
  .ssa-model-row .v { color: var(--white); font-weight: 700; text-align: right; }
  .ssa-model-row .v.gold { color: var(--gold); }
  .ssa-side-divider { height: 1px; background: var(--border); }
  .ssa-export-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--gray);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ssa-export-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  .ssa-export-btn svg { flex-shrink: 0; }
  .ssa-metric-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 1100px) { .ssa-metric-cards { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 480px)  { .ssa-metric-cards { grid-template-columns: 1fr; } }
  .ssa-metric-card {
    background: var(--dark2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px 16px;
    min-width: 0;
  }
  .ssa-today-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--st-green-bg);
    border: 1px solid rgba(74,222,128,0.35);
    color: var(--st-green-fg);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .ssa-chart-legend {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--gray);
    margin-top: 4px;
  }
  .ssa-chart-legend .lg { display: inline-flex; align-items: center; gap: 6px; }
  .ssa-chart-legend .swatch { width: 16px; height: 2px; border-radius: 2px; display: inline-block; }
  .ssa-range-track {
    width: 92px;
    height: 5px;
    background: var(--border);
    border-radius: 999px;
    overflow: hidden;
  }
  .ssa-range-fill { height: 100%; background: var(--gold); border-radius: 999px; }
  .ssa-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: var(--dark);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--gray);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ssa-icon-btn:hover { color: var(--white); border-color: rgba(212,168,67,0.4); }
  /* Sales Quantity - units planning summary strip */
  .ssa-units-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 36px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .ssa-units-summary > div { display: flex; flex-direction: column; gap: 4px; }
  .ssa-units-summary .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray); font-weight: 600; }
  .ssa-units-summary .v { font-size: 16px; font-weight: 700; color: var(--white); }
  .ssa-units-summary .v.gold { color: var(--gold); }
`;

/**
 * ISO-8601 week number AND the ISO year it belongs to.
 *
 * Both halves used to be wrong in their own way.
 *
 * It read date.getFullYear()/getMonth()/getDate() - the VIEWER's reading of a
 * Date built from a "YYYY-MM-DD" backend label, which parses at UTC midnight.
 * West of UTC that local reading is the day before, so four labels in five came
 * out a week early: "2026-09-28" rendered as W39 instead of W40. It reads UTC
 * components now, matching how every caller builds the date and how
 * formatDateLabel reads the year beside it.
 *
 * And the week number was paired with the CALENDAR year, which is a different
 * calendar. The week holding 2024-12-30 is ISO week 1 of 2025, but it rendered
 * as "W1 2024" - the same label as 2024-01-01, 52 weeks earlier. Two distinct
 * periods with one name, in a chart axis and in the forecast date picker's
 * options. The ISO year is the year of the Thursday this already computes, so
 * it is returned rather than inferred.
 */
function getISOWeekParts(date) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday that fixes the ISO year
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  return {
    week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7),
    isoYear,
  };
}

// Future period-start dates from the current period forward (W-MON / month-start
// / year-start), matching the backend's date conventions. Used by the inventory
// fallback projection when there isn't enough history to run SSA.
function genFuturePeriods(count, periodType) {
  // Anchored to the shop's calendar day, then stepped as a date string - the same
  // discipline as the other period walkers here. Reading now.getUTCDate() instead
  // put the first period a day early, and so a whole week or month early, for the
  // eight hours a day the UTC date lags Manila's.
  const today = businessToday();
  let cur = new Date(today + "T00:00:00Z");
  if (periodType === "weekly") {
    const day = cur.getUTCDay();
    cur.setUTCDate(cur.getUTCDate() + (day === 0 ? -6 : 1 - day)); // Monday of this week
  } else if (periodType === "monthly") {
    cur = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  } else {
    cur = new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(cur.toISOString().slice(0, 10));
    if (periodType === "weekly") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (periodType === "monthly") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCFullYear(cur.getUTCFullYear() + 1);
  }
  return out;
}

// ── Inventory policy (Phase A) ────────────────────────────────────────────
// Honest reorder-decision math: characterise demand, then derive safety stock,
// reorder point and order quantity. SSA/forecast curves are demand estimates;
// the *decision* (when/how much to reorder) is what this produces.
const PERIOD_DAYS = { weekly: 7, monthly: 30.44, annually: 365.25 };
const SERVICE_Z = 1.65;        // 95% service level (z-score)
const DEFAULT_LEAD_DAYS = 7;   // fallback until per-item lead time exists (Phase B)
const REVIEW_DAYS = 7;         // the shop buys weekly - the gap between buying trips
// Mirrors min_data in ssa-service/main.py for sparse series (stock/demand).
// Kept in step with the service so the page never withholds a series the
// service would happily forecast.
const SERVICE_MIN_PERIODS = { weekly: 4, monthly: 3, annually: 12 };

/**
 * How many periods the SSA service will actually see.
 *
 * bucketDemand extends its series to today on purpose - the policy needs the
 * recent zero periods to measure how intermittent demand is. The service does
 * not: it resamples between the first and last row it was given. Counting with
 * bucketDemand therefore over-states eligibility, and the page can offer a
 * series the service then rejects for having too few complete periods.
 */
function countServicePeriods(rows, periodType) {
  if (!rows || rows.length === 0) return 0;
  const key = (dateStr) => {
    const dt = new Date(dateStr + "T00:00:00Z");
    if (periodType === "weekly") {
      const day = dt.getUTCDay();
      dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
    } else if (periodType === "monthly") {
      dt.setUTCDate(1);
    } else {
      dt.setUTCMonth(0, 1);
    }
    return dt.toISOString().slice(0, 10);
  };
  const first = key(rows[0].date);
  const last = key(rows[rows.length - 1].date);
  let n = 0;
  const cur = new Date(first + "T00:00:00Z");
  const end = new Date(last + "T00:00:00Z");
  let guard = 0;
  while (cur <= end && guard < 1200) {
    n++;
    if (periodType === "weekly") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (periodType === "monthly") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCFullYear(cur.getUTCFullYear() + 1);
    guard++;
  }
  return n;
}

// Aggregate daily demand rows into a continuous per-period series (first sale →
// current period, zero-filled) so intermittency/variability are measured honestly.
function bucketDemand(rows, periodType) {
  if (!rows || rows.length === 0) return [];
  const periodKey = (dateStr) => {
    const dt = new Date(dateStr + "T00:00:00Z");
    if (periodType === "weekly") {
      const day = dt.getUTCDay();
      dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
    } else if (periodType === "monthly") {
      dt.setUTCDate(1);
    } else {
      dt.setUTCMonth(0, 1);
    }
    return dt.toISOString().slice(0, 10);
  };
  const map = {};
  rows.forEach((r) => { const k = periodKey(r.date); map[k] = (map[k] ?? 0) + (r.value ?? 0); });
  const keys = Object.keys(map).sort();
  if (keys.length === 0) return [];
  const series = [];
  let cur = new Date(keys[0] + "T00:00:00Z");
  const end = new Date(periodKey(businessToday()) + "T00:00:00Z");
  let guard = 0;
  while (cur <= end && guard < 1200) {
    series.push(map[cur.toISOString().slice(0, 10)] ?? 0);
    if (periodType === "weekly") cur.setUTCDate(cur.getUTCDate() + 7);
    else if (periodType === "monthly") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCFullYear(cur.getUTCFullYear() + 1);
    guard++;
  }
  return series;
}

function computeInventoryPolicy({ rawRows, currentStock, leadTimeDays, supplierLead, periodType, forecastValues }) {
  const series = bucketDemand(rawRows, periodType);
  const n = series.length;
  const nz = series.filter((v) => v > 0);
  const histMean = n ? series.reduce((a, b) => a + b, 0) / n : 0;

  // The rate the policy plans against must be the same rate the chart depletes
  // with. This used to be the mean of past periods while the depletion line and
  // the stockout date on the same screen subtracted the forecast - so a rising
  // forecast never moved the reorder point. Take the forward rate from the
  // forecast when there is one; keep the historical mean as the fallback.
  // ...but only once there is enough history for the forecast's rate to mean
  // something. Croston/SBA at alpha 0.1 stays anchored to its first
  // observation for twenty-odd periods; on four weeks of 10, 0, 50, 30 it
  // returns 13.6 against a mean of 22.5 and would under-order by forty
  // percent. Eight weeks is the confidence line the restock proposal draws,
  // and /api/inventory-plan applies the same rule, so page and service agree.
  const fc = Array.isArray(forecastValues) ? forecastValues.filter((v) => Number.isFinite(v)) : [];
  const weeksOfHistory = (n * (PERIOD_DAYS[periodType] ?? 7)) / 7;
  const mean = fc.length > 0 && weeksOfHistory >= 8 ? fc.reduce((a, b) => a + b, 0) / fc.length : histMean;
  // Spread stays measured around the historical mean. Variability is an
  // observed property of past demand; centring it on a forward rate would
  // inflate it by however far the forecast has moved.
  const variance = n > 1 ? series.reduce((a, b) => a + (b - histMean) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);

  // Intermittency (Syntetos-Boylan): ADI = avg gap between demands, CV² of sizes.
  const adi = nz.length ? n / nz.length : Infinity;
  const nzMean = nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0;
  const nzVar = nz.length > 1 ? nz.reduce((a, b) => a + (b - nzMean) ** 2, 0) / (nz.length - 1) : 0;
  const cv2 = nzMean > 0 ? (Math.sqrt(nzVar) / nzMean) ** 2 : 0;

  let cls;
  if (nz.length === 0 || n < 3) cls = "new";
  else if (adi <= 1.32 && cv2 <= 0.49) cls = "steady";
  else if (adi > 1.32 && cv2 <= 0.49) cls = "intermittent";
  else if (adi <= 1.32 && cv2 > 0.49) cls = "variable";
  else cls = "lumpy";

  const daysPerPeriod = PERIOD_DAYS[periodType] ?? 7;

  // Lead time, in order of how much it is worth: measured from this supplier's
  // own receipts once there are enough of them; the number typed on the
  // material; and finally an assumed week, flagged wherever it is used.
  // Measured comes with a spread; the other two do not.
  let leadDays, leadSource, sigmaLeadDays = 0;
  if (supplierLead?.sufficient) {
    leadDays = supplierLead.meanDays; sigmaLeadDays = supplierLead.sigmaDays ?? 0; leadSource = "measured";
  } else if (leadTimeDays != null && leadTimeDays > 0) {
    leadDays = leadTimeDays; leadSource = "typed";
  } else {
    leadDays = DEFAULT_LEAD_DAYS; leadSource = "assumed";
  }
  const hasLead = leadSource !== "assumed";
  const L = leadDays / daysPerPeriod;            // lead time in periods
  const sigmaL = sigmaLeadDays / daysPerPeriod;  // its spread, in periods
  const R = REVIEW_DAYS / daysPerPeriod;         // buying cycle in periods
  const d = mean;                                 // demand rate (units/period)
  // Safety stock with both spreads: z * sqrt(L*sigma_d^2 + d^2*sigma_L^2).
  // With no measured lead time sigmaL is 0 and this is the plain z*sigma*sqrt(L).
  const SS = Math.max(0, SERVICE_Z * Math.sqrt(L * sigma ** 2 + d ** 2 * sigmaL ** 2));
  const ROP = d * L + SS;
  // Order-up-to must cover the wait for delivery AND the gap until the next
  // buying trip, and its safety margin scales with that whole window. The old
  // form used d*(L+L) with the lead-time safety stock, which silently assumed
  // the shop reorders exactly as often as the supplier takes to deliver, and
  // under-protected the review gap.
  const orderUpTo = d * (L + R) + Math.max(0, SERVICE_Z * Math.sqrt((L + R) * sigma ** 2 + d ** 2 * sigmaL ** 2));
  const orderQty = Math.max(0, orderUpTo - (currentStock ?? 0));
  const cov = currentStock ?? 0;
  const coverage = d > 0 ? cov / d : null;        // periods of cover (null ≈ unlimited)
  const periodsToROP = d > 0 && cov > ROP ? (cov - ROP) / d : 0;

  // The other end of the question the reorder point answers. The policy plans to
  // cover the wait for delivery plus one buying trip; holding several times that,
  // AND more than the order-up-to level, is stock that will sit. Same rule as
  // apply/inventory-plan in the service - both must agree or the page and the
  // stored plan will disagree about the same material.
  const targetPeriods = L + R;
  const overstocked = coverage != null && targetPeriods > 0
    && coverage > targetPeriods * 3 && cov > orderUpTo;
  const excessQty = overstocked ? Math.max(0, cov - orderUpTo) : 0;

  return {
    d, sigma, adi, cv2, cls, L, R, leadDays, leadSource, sigmaLeadDays, reviewDays: REVIEW_DAYS, daysPerPeriod,
    usingDefaultLead: !hasLead,
    SS: Math.round(SS), ROP: Math.round(ROP), orderUpTo: Math.round(orderUpTo),
    orderQty: Math.round(orderQty),
    coverage, periodsToROP, nPeriods: n, nzCount: nz.length,
    overstocked, excessQty: Math.round(excessQty),
  };
}

// Plain descriptions of the sales pattern. These say what the shop would
// observe, not which algorithm ran - naming Croston/SBA here was misleading,
// because it described what the classifier implies rather than what actually
// produced the number on screen.
// "Intermittent" and "Lumpy" are forecasting terms, not shop terms. The owner
// reading this wants to know how the thing sells, so the label says that and
// the note underneath says what it means for planning.
const DEMAND_CLASS = {
  steady:       { label: "Sells steadily",   color: "var(--st-green-fg)", note: "regular orders, similar sizes - easiest to plan for" },
  variable:     { label: "Uneven sizes",     color: "var(--st-amber-fg)", note: "orders come regularly, but the amounts jump around" },
  intermittent: { label: "Sells now and then", color: "var(--st-amber-fg)", note: "quiet stretches, then an order of a fairly usual size" },
  lumpy:        { label: "Hard to predict",  color: "var(--st-red-fg)", note: "long quiet stretches, then an order of any size - keep a bigger buffer" },
  new:          { label: "Too new to tell",  color: "var(--st-gray-fg)", note: "not enough history yet to see a pattern" },
};

// How the number on screen was actually produced, in the reader's terms.
function estimatePhrase(result) {
  if (result?.is_fallback) return "averaged from past sales";
  if (result?.method === "sba") return "a flat rate - sales are too sparse for a trend";
  return "a trend model fitted to past sales";
}

// "99+ weeks" of cover is true but unreadable. Say it the way a person would.
function coveragePhrase(periods, unitSingular, daysPerPeriod = 7) {
  if (periods == null) return "no demand to run down";
  const days = periods * daysPerPeriod;
  if (days >= 730) return "over 2 years";
  if (days >= 365) return "over a year";
  if (days >= 60)  return `about ${Math.round(days / 30.44)} months`;
  return `about ${Math.round(periods)} ${unitSingular}${Math.round(periods) === 1 ? "" : "s"}`;
}

// Adaptive precision for demand figures: slow sellers have sub-unit demand
// (e.g. ~0.2/week) that must not round to 0, while fast movers stay whole.
function fmtDemand(v) {
  if (v == null || Number.isNaN(v) || v <= 0) return "0";
  if (v < 1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

// Helper to resolve accuracy from the API response.
// Priority: mape (on non-zero actuals) → mae_ratio (fallback when all actuals are zero) → null (N/A)
// mape:      MAPE computed only on weeks that had real sales; returns None when all backtest weeks are zero
// mae_ratio: MAE ÷ avg non-zero training sale × 100; used when the entire backtest window is zeros
function resolveAccuracy(accuracy, isHighVolatility = false) {
  if (!accuracy)
    return {
      value: null,
      label: "FORECAST ACCURACY",
      sublabel: null,
      color: "var(--gray)",
    };

  const mape = accuracy.mape;
  const maeRatio = accuracy.mae_ratio;
  const btN = accuracy.backtest_n;
  const btNz = accuracy.backtest_nz_count ?? null;
  const mapeReliable = accuracy.mape_reliable !== false;
  // What the figure is actually built on. MAPE averages only the periods that
  // had sales, so a window of 8 with 3 quiet weeks reports a number 5 periods
  // wide - worth saying out loud rather than printing one decimal and a colour.
  const scored = accuracy.mape_scored ?? null;
  const total = accuracy.mape_total ?? null;
  const mase = accuracy.mase ?? null;
  // Already thresholded by the service, which applies a period-aware limit
  // (6 weekly, 3 monthly, 1 annually) and returns 0 below it. Re-testing >= 6
  // here would have hidden every monthly and annual gap.
  const gap = accuracy.training_gap ?? 0;

  if (mape != null) {
    // For high-volatility spike-demand data, high MAPE is expected - the model
    // tracks the revenue trend, not the exact timing of individual order spikes.
    // For annual forecasts backed by only 1 full-year backtest bin, MAPE is
    // statistically unreliable (single-observation estimate).
    const unreliable = !mapeReliable;
    const color = unreliable
      ? "var(--gray)"
      : isHighVolatility
        ? "var(--gray)"
        : mape < 30
          ? "var(--st-green-fg)"
          : mape < 60
            ? "var(--st-amber-fg)"
            : "var(--st-red-fg)";

    return {
      value: mape,
      display: `${mape.toFixed(1)}%`,
      label: unreliable ? "MAPE (LOW CONFIDENCE)" : "FORECAST ACCURACY (MAPE)",
      sublabel: (scored != null && total)
        ? `averaged over ${scored} of ${total} periods${mase != null ? ` - MASE ${mase.toFixed(2)}` : ""}`
        : btN
          ? `tested on ${btN} ${btNz != null ? `periods (${btNz} with sales)` : "periods"}`
          : "insufficient data",
      color,
      tooltip: gap > 0
        ? `The training history contains ${gap} periods in a row with nothing recorded. A period with no demand and a period nobody entered anything into look the same to the model, so it learns from a drop that may never have happened. Treat this figure as provisional until the history is continuous.`
        : (scored != null && total && scored < 4)
          ? `Averaged over only ${scored} ${scored === 1 ? "period" : "periods"} - the rest of the window had no sales, and MAPE cannot score those. Too few points to call it an accuracy.`
          : unreliable
            ? isHighVolatility
              ? "MAPE exceeds 300% because sales are sparse and spike-driven - the model cannot reliably predict the exact timing of individual orders. Use the forecast as a directional trend guide, not a precise estimate."
              : "Annual MAPE is based on fewer than 2 full calendar-year backtest periods, making it a single-observation estimate and statistically unreliable. Use it as a rough guide only."
            : isHighVolatility
              ? "MAPE measures forecast accuracy on weeks with actual sales. For irregular spike-demand businesses, high MAPE is expected - the model tracks your revenue trend, not individual order timing. The forecast baseline is more useful than this number alone."
              : "MAPE (Mean Absolute % Error) scores only the periods that had real sales; quiet periods are left out, which is why the count beside it matters. MASE scores every period against a naive guess - under 1.00 beats it. Lower is better for both.",
    };
  }

  if (maeRatio != null) {
    const color = maeRatio < 50 ? "var(--st-amber-fg)" : "var(--st-red-fg)";
    return {
      value: maeRatio,
      display: `~${maeRatio.toFixed(1)}%`,
      label: "ERROR VS AVG SALE",
      sublabel: "backtest weeks had no sales - using MAE ratio",
      color,
      tooltip:
        "All backtest weeks had zero actual sales, so MAPE cannot be computed. This shows MAE ÷ average non-zero sale × 100. It estimates how large the forecast error is relative to a typical sale.",
    };
  }

  // Two different silences: a window that ran and scored nothing, and a history
  // too short for a backtest to run at all. The second was showing an empty
  // accuracy area beside a forecast, saying nothing about being untested.
  const neverRan = !btN || total === 0;
  return {
    value: null,
    display: neverRan ? "NOT TESTED" : "N/A",
    label: "FORECAST ACCURACY",
    sublabel: neverRan
      ? "history too short to check this forecast against"
      : "no sales in backtest window",
    color: "var(--gray)",
    tooltip:
      neverRan
        ? "There is not enough history to hold any of it back and check this forecast against it, so it is untested - the model's best estimate from what exists, with nothing measuring how close it lands."
        : "Accuracy could not be computed because all backtest weeks had zero actual sales. The model still produces a forecast, but there is no valid reference period to measure against.",
  };
}

export default function SSAForecastPage() {
  const { token } = useAuth();
  const chartRef = useRef(null);

  const [dataSource, setDataSource] = useState("sales_revenue");
  const [forecastPeriod, setForecastPeriod] = useState(FORECAST_PERIODS[0]);
  const [forecastCount, setForecastCount] = useState("");
  const [dynamicMaxCount, setDynamicMaxCount] = useState(
    FORECAST_PERIODS[0].maxCount,
  );
  const [inventoryList, setInventoryList] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  // Mother item -> variant -> material tree, resolved server-side. Sales carry
  // no inventoryId, so material demand has to be rebuilt through the BOM.
  const [taxonomy, setTaxonomy] = useState(null);
  const [selectedMotherId, setSelectedMotherId] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");   // "" = all variants
  const [demandBasis, setDemandBasis] = useState(null);
  const [showTrend, setShowTrend] = useState(false);
  const [showSeasonality, setShowSeasonality] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);
  const [showBacktest, setShowBacktest] = useState(false);
  const [showDecomp, setShowDecomp] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submittedConfig, setSubmittedConfig] = useState(null);
  // FIX: dataPointCount = raw DB rows (true input size); trainingPeriods = SSA-aggregated count
  const [dataPointCount, setDataPointCount] = useState(0);
  const [trainingPeriods, setTrainingPeriods] = useState(null);
  const [backtestData, setBacktestData] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [pickerDate, setPickerDate] = useState("");
  const [stockHistoryRows, setStockHistoryRows] = useState([]);
  const [stockoutDate, setStockoutDate] = useState(null);
  // Two different numbers, deliberately kept apart. currentStockQty is what is
  // physically on the shelf - it anchors the chart, which is drawn from
  // remainingQty events, and it is what "Current Stock" means to a reader.
  // availableQty is what is free to plan with, and drives the reorder point,
  // the stockout date and the restock quantity.
  const [currentStockQty, setCurrentStockQty] = useState(null);
  const [reservedQty, setReservedQty] = useState(0);
  const availableQty = currentStockQty === null ? null : Math.max(0, currentStockQty - reservedQty);
  const [salesTruncated, setSalesTruncated] = useState(false);
  const [depletionMethod, setDepletionMethod] = useState(null);

  const [activeTab, setActiveTab] = useState("forecast");
  const [rfmResult, setRfmResult] = useState(null);
  const [serviceResult, setServiceResult] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [rfmError, setRfmError] = useState("");
  const [serviceError, setServiceError] = useState("");


  useEffect(() => {
    try {
      const saved = localStorage.getItem("ssa_config");
      if (saved) {
        const { source, periodType } = JSON.parse(saved);
        const src = DATA_SOURCES.find((s) => s.key === source);
        const per = FORECAST_PERIODS.find((p) => p.type === periodType);
        if (src) setDataSource(src.key);
        if (per) setForecastPeriod(per);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((d) => {
        const items = d.data ?? d ?? [];
        const all = Array.isArray(items) ? items : [];
        // Exclude parent containers - only leaf/variant items can be forecasted
        const list = all.filter((item) => !item.hasVariants);
        setInventoryList(list);
        if (list.length > 0)
          setSelectedInventoryId(list[0]._id ?? list[0].id ?? "");
      })
      .catch(() => setInventoryList([]));
  }, [token]);

  // Product -> variant -> material tree. Drives the mother-item picker and the
  // BOM join that turns sales of a product into demand for its raw materials.
  useEffect(() => {
    if (!token) return;
    fetchWithTimeout(`${API_URL}/api/admin/forecast/taxonomy`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((d) => setTaxonomy(d.data ?? d ?? null))
      .catch(() => setTaxonomy(null));
  }, [token]);

  const handleSubmit = async (overrideCount = null) => {
    const count = overrideCount ?? parseInt(forecastCount, 10);
    if (!count || count < 1) {
      if (overrideCount === null) setError(`Please enter how many ${forecastPeriod.unit} ahead to forecast.`);
      return;
    }
    if (!token) return;
    if (dataSource === "inventory_stock" && !selectedInventoryId) {
      setError("Please select an inventory item.");
      return;
    }
    try {
      localStorage.setItem(
        "ssa_config",
        JSON.stringify({ source: dataSource, periodType: forecastPeriod.type }),
      );
    } catch (_) {}
    setError("");
    setResult(null);
    setSubmittedConfig(null);
    setStockHistoryRows([]);
    setStockoutDate(null);
    setCurrentStockQty(null);
    setReservedQty(0);
    setDepletionMethod(null);
    setDemandBasis(null);
    setIsLoading(true);

    // Average-demand projection used whenever SSA can't run for an inventory
    // item (too few records, or too few aggregated periods for the backend).
    // Guarantees the depletion view always renders, no matter how low/out of stock.
    const applyInvFallback = (rows) => {
      const periodType = forecastPeriod.type;
      const totalQty = rows.reduce((s, r) => s + (r.value ?? 0), 0);
      let avgDemand = 0;
      if (rows.length > 0) {
        const first = new Date(rows[0].date + "T00:00:00Z");
        const last  = new Date(rows[rows.length - 1].date + "T00:00:00Z");
        const days  = Math.max(1, (last - first) / 86400000 + 1);
        const span  = periodType === "weekly" ? days / 7 : periodType === "monthly" ? days / 30.44 : days / 365.25;
        avgDemand = totalQty / Math.max(1, span);
      }
      const fcDates  = genFuturePeriods(count, periodType);
      const fcValues = fcDates.map(() => avgDemand);

      // Confidence band from the observed spread of past periods, not from a
      // fixed multiple. The old band was value x 1.5 and x 0.5, which looked
      // like the SSA band but carried no information: it was the same shape
      // whether demand was rock steady or wildly lumpy. Using the sample
      // standard deviation of the bucketed history makes the band mean
      // something, and a material with no variation gets no band at all.
      const buckets = bucketDemand(rows, periodType);
      let sigma = 0;
      if (buckets.length > 1) {
        const mean = buckets.reduce((s, v) => s + v, 0) / buckets.length;
        const variance = buckets.reduce((s, v) => s + (v - mean) ** 2, 0) / (buckets.length - 1);
        sigma = Math.sqrt(Math.max(0, variance));
      }
      const Z = 1.65;   // ~90% - the same service level the reorder point uses
      const halfBand = Z * sigma;
      setSubmittedConfig({
        count,
        period: forecastPeriod,
        source: dataSource,
        sourceLabel: DATA_SOURCES.find((s) => s.key === dataSource)?.label ?? "",
      });
      setResult({
        forecast: {
          dates: fcDates,
          values: fcValues,
          confidence_high: fcValues.map((v) => v + halfBand),
          confidence_low:  fcValues.map((v) => Math.max(0, v - halfBand)),
        },
        accuracy: null,
        training_n: rows.length,
        training_unit: forecastPeriod.unit,
        is_fallback: true,
        fallback_sigma: Math.round(sigma * 100) / 100,
      });
      setRawRows(rows);
      setLastRunAt(new Date());
      setDataPointCount(rows.length);
      setTrainingPeriods(rows.length);
      setBacktestData([]);
      setDepletionMethod("average");
    };

    let rows = [];
    let invPeriods = 0;
    try {
      if (dataSource === "sales_revenue" || dataSource === "sales_qty") {
        const res = await apiFetch(
          `${API_URL}/api/admin/sales?limit=10000&status=completed`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        requireOk(res, "sales history");
        const d = await res.json();
        const sales = Array.isArray(d.data ?? d) ? (d.data ?? d) : [];
        // The API caps at 10,000 rows sorted newest first, so an overflow costs
        // the oldest history - the part the forecast trains on.
        setSalesTruncated(d.meta?.truncated === true);
        const map = {};
        sales.forEach((s) => {
          const date = businessDate(s.saleDate);
          if (!date) return;
          if (!map[date]) map[date] = { revenue: 0, qty: 0 };
          map[date].revenue += s.totalPrice ?? 0;
          map[date].qty += s.quantity ?? 0;
        });
        rows = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({
            date,
            value: dataSource === "sales_revenue" ? v.revenue : v.qty,
          }));
      } else {
        // Fetch stock history (staircase reference) and all sales (SSA demand input) in parallel
        const [histResponse, salesResponse] = await Promise.all([
          apiFetch(
            `${API_URL}/api/admin/inventory/${selectedInventoryId}/history`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
          ),
          apiFetch(
            `${API_URL}/api/admin/sales?limit=10000&status=completed`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
          ),
        ]);
        requireOk(histResponse,  "stock history");
        requireOk(salesResponse, "sales history");
        const histData  = await histResponse.json();
        const salesData = await salesResponse.json();
        setSalesTruncated(salesData.meta?.truncated === true);
        const history  = Array.isArray(histData.data  ?? histData)  ? (histData.data  ?? histData)  : [];
        const allSales = Array.isArray(salesData.data ?? salesData) ? (salesData.data ?? salesData) : [];

        // Build stock history staircase - raw events sorted chronologically (left of today)
        const sortedHistory = [...history]
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          .map(h => ({
            date:  businessDate(h.createdAt),
            value: h.remainingQty ?? 0,
          }))
          .filter(h => h.date !== null);

        setStockHistoryRows(sortedHistory);

        // Depletion starts from what is actually free to use, not from the
        // shelf count. Stock already reserved against open orders is spoken
        // for - counting it as available delays every stockout warning by
        // however much is promised (20 of the 134 mugs, at the time of
        // writing).
        const selectedItem = inventoryList.find(i => (i._id ?? i.id) === selectedInventoryId);
        setCurrentStockQty(selectedItem?.stockQty ?? 0);
        setReservedQty(selectedItem?.reservedQty ?? 0);

        // Material demand via the bill of materials. The old filter matched a
        // sale to a material by inventoryId or by an exact name match; neither
        // is ever true (0 of 370 sales carry an inventoryId, and no product is
        // named after the material it is made from), so every material read as
        // zero demand. Walk the BOM instead.
        const demand = buildMaterialDemand(selectedInventoryId, taxonomy, allSales, history);
        rows = demand.rows;
        setDemandBasis(demand.linked ? demand.basis : null);

        if (!demand.linked) {
          // Nothing consumes this material, so there is no demand to forecast.
          // Say so rather than drawing a confident flat line.
          setError("");
          setDepletionMethod("unlinked");
          applyInvFallback([]);
          setIsLoading(false);
          return;
        }

        // Linked to a BOM but never sold is a different answer from "too few
        // records to run SSA" - the material has no demand rather than thin
        // demand, and saying so is more useful than an average of nothing.
        if (rows.length === 0) {
          setDepletionMethod("nodemand");
          applyInvFallback([]);
          setIsLoading(false);
          return;
        }

        // Eligibility is counted in PERIODS, not raw daily rows. A ledger-based
        // demand series has one row per day something was consumed - four weeks
        // of real movement can be four rows - while a sales-derived series
        // spread over three years has dozens. The old "10 raw rows" gate sent
        // every ledger-sourced material to the average-demand fallback even
        // though the service accepts it and returns a proper Croston/SBA rate.
        // Match the service's own minimum instead.
        invPeriods = countServicePeriods(rows, forecastPeriod.type);
      }

      // Inventory never hard-fails on sparse data - use the average-demand
      // fallback so the depletion view always renders.
      if (dataSource === "inventory_stock") {
        const minPeriods = SERVICE_MIN_PERIODS[forecastPeriod.type] ?? 4;
        if (invPeriods < minPeriods) {
          setDepletionMethod("none");
          applyInvFallback(rows);
          setIsLoading(false);
          return;
        }
        setDepletionMethod("ssa");
      }

      // Sales tabs only. Inventory decided its own path just above, on periods
      // rather than raw rows - a ledger series of 5 daily rows can span the 4
      // weeks the service needs, and falling through to this row count sent it
      // to a hard error instead of the chart.
      if (dataSource !== "inventory_stock" && rows.length < 10) {
        setError(`Not enough data points (${rows.length}). SSA requires at least 10.`);
        setIsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const ssaRes = await fetch(`${SSA_API_URL}/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          forecast_periods: count,
          forecast_type: forecastPeriod.type,
          // What we send for inventory is material demand per day - a flow, not
          // a stock level. Calling it "stock" made the service forward-fill the
          // history line and report the last raw row as the headline figure,
          // which are level behaviours. "demand" keeps the sparse handling
          // (zeros are real, intermittent series route to Croston/SBA) without
          // the level display.
          data_type: dataSource === "inventory_stock" ? "demand" : "sales",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const raw =
          typeof err.detail === "string"
            ? err.detail
            : JSON.stringify(err.detail) || "SSA forecast failed.";
        throw new Error(raw.split("\n")[0].split("\\n")[0]);
      }

      const data = await ssaRes.json();
      setSubmittedConfig({
        count,
        period: forecastPeriod,
        source: dataSource,
        sourceLabel:
          DATA_SOURCES.find((s) => s.key === dataSource)?.label ?? "",
      });

      // FIX: The date-shift block that moved forecast dates to "today" has been
      // removed. It was detaching the forecast from the historical series and
      // creating a multi-month gap in the chart. The backend already computes
      // correct forward-looking dates starting from the week after the last
      // historical data point - no frontend override needed.

      if (data.safe_max != null) {
        setDynamicMaxCount(data.safe_max);
        setForecastCount((prev) => {
          const n = parseInt(prev, 10);
          if (!n || n < 1) return prev;
          return n > data.safe_max ? data.safe_max : prev;
        });
      }

      setResult(data);
      setRawRows(rows);
      setLastRunAt(new Date());

      // FIX: Use raw DB row count for "Historical Data Points" - this is the
      // true input size before SSA weekly/monthly aggregation. Previously we
      // used data.historical.dates.length which is the trimmed daily display
      // array and was returning 1094 instead of the correct 1095-1096.
      setDataPointCount(rows.length);
      setTrainingPeriods(data.training_n ?? null);

      const btSeries = data?.backtest_series;
      if (btSeries?.dates?.length > 0) {
        setBacktestData(
          btSeries.dates.map((date, i) => ({
            date,
            BacktestActual: btSeries.actuals[i],
          })),
        );
      } else {
        setBacktestData([]);
      }
    } catch (err) {
      // Inventory always degrades to an average-demand projection rather than
      // showing an error - so the depletion view works even if SSA is down or
      // rejected the (sparse) data.
      if (dataSource === "inventory_stock") {
        applyInvFallback(rows);
      } else {
        setError(describeForecastError(err, SSA_API_URL));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadRFM = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setRfmError("");
    try {
      const res = await apiFetch(`${API_URL}/api/admin/analytics/rfm-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      requireOk(res, "customer data");
      const d = await res.json();
      const sales = d.data ?? [];
      if (sales.length === 0) {
        setRfmError("No sales data found for customer segmentation.");
        return;
      }
      const ssaRes = await fetch(`${SSA_API_URL}/api/customer-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales }),
      });
      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(msg.split("\n")[0] || "Customer segmentation failed.");
      }
      setRfmResult(await ssaRes.json());
    } catch (err) {
      setRfmError(describeForecastError(err, SSA_API_URL));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadService = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setServiceError("");
    try {
      const res = await apiFetch(`${API_URL}/api/admin/analytics/service-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      requireOk(res, "service data");
      const d = await res.json();
      const sales = d.data ?? [];
      if (sales.length === 0) {
        setServiceError("No sales data found for service segmentation.");
        return;
      }
      // Group at the mother item before ranking. The service groups on
      // productName, so "Mugs" from the imported history and each 2026 mug
      // variant were ranked as unrelated products - one product split several
      // ways, each looking smaller than it is. Resolving the name here keeps
      // the grouping on the page, as agreed, and leaves the service untouched.
      const rolledUp = sales.map((s) => {
        const r = taxonomy?.saleResolution?.[s.productName];
        return r?.productName ? { ...s, productName: r.productName } : s;
      });
      const ssaRes = await fetch(`${SSA_API_URL}/api/service-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales: rolledUp }),
      });
      if (!ssaRes.ok) {
        const err = await ssaRes.json().catch(() => ({}));
        const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        throw new Error(msg.split("\n")[0] || "Service segmentation failed.");
      }
      setServiceResult(await ssaRes.json());
    } catch (err) {
      setServiceError(describeForecastError(err, SSA_API_URL));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    setServiceError("");
    try {
      const serviceRes = await apiFetch(`${API_URL}/api/admin/analytics/service-data`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      requireOk(serviceRes, "service data");
      const serviceD = await serviceRes.json();
      const sales = serviceD.data ?? [];
      // Same mother-item roll-up as loadServiceSegments, so both entry points
      // rank the same products rather than one splitting them by variant.
      const rolledUp = sales.map((s) => {
        const r = taxonomy?.saleResolution?.[s.productName];
        return r?.productName ? { ...s, productName: r.productName } : s;
      });
      const sRes = sales.length > 0
        ? await fetch(`${SSA_API_URL}/api/service-segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sales: rolledUp }),
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        : null;
      if (sRes) setServiceResult(sRes);
      else setServiceError("No product data found.");
    } catch (err) {
      setServiceError(err.message || "Failed to load product data.");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Auto-load the analytics tabs the first time they're opened, so users don't
  // have to click "Run Analysis" - the data that needs projecting loads itself.
  useEffect(() => {
    if (!token) return;
    if (activeTab === "segments" && !rfmResult && !analyticsLoading && !rfmError) {
      loadRFM();
    } else if (activeTab === "products" && !serviceResult && !analyticsLoading && !serviceError) {
      loadProducts();
    }
  }, [activeTab, token]); // eslint-disable-line

  // Reset date picker when forecast result or period changes
  useEffect(() => { setPickerDate(""); }, [result, forecastPeriod.type]); // eslint-disable-line

  // Compute stockout date whenever inventory depletion forecast updates
  useEffect(() => {
    if (submittedConfig?.source !== "inventory_stock" || !result || availableQty === null) {
      setStockoutDate(null);
      return;
    }
    const todayStr = businessToday();
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    // Keep remaining as a float, the way the depletion chart does. Rounding
    // each period on its own erases every material whose demand is under half
    // a unit per period - a sticker sheet at 0.26/week rounds to 0 forever and
    // reports "never runs out", which is the flat line this page is meant to
    // have stopped drawing.
    // Plan against what is free to use: stock already promised to open orders
    // will leave the shelf regardless of forecast demand.
    let remaining = availableQty;
    for (let i = 0; i < fcDates.length; i++) {
      if (fcDates[i] <= todayStr) continue;
      remaining -= Math.max(0, fcValues[i] ?? 0);
      if (remaining <= 0) { setStockoutDate(fcDates[i]); return; }
    }
    setStockoutDate(null);
  }, [result, availableQty, submittedConfig?.source]); // eslint-disable-line

  // Auto-run: fires on mount (init) and whenever source/period/count changes
  // - On mount or when no count entered: runs with overrideCount=1 to populate training data + metrics
  // - When count is entered: runs with that count (debounced 700ms)
  const _autoRunTimer   = useRef(null);
  const _submitRef      = useRef(null);
  const _hasMounted     = useRef(false);
  _submitRef.current    = handleSubmit;

  useEffect(() => {
    // Inventory needs a selected item before it can auto-run; sales modes don't.
    if (dataSource === "inventory_stock" && !selectedInventoryId) return;
    const count = parseInt(forecastCount, 10);
    // No count entered → warm-up run. Sales use 1 (just to load training data),
    // but inventory needs a few future periods so the depletion line is visible.
    const invWarm = forecastPeriod.type === "weekly" ? 8 : forecastPeriod.type === "monthly" ? 6 : 2;
    const runCount = count >= 1 ? count : (dataSource === "inventory_stock" ? invWarm : 1);
    const delay = !_hasMounted.current ? 200 : 700;
    if (!_hasMounted.current) _hasMounted.current = true;
    if (!token) return;
    if (_autoRunTimer.current) clearTimeout(_autoRunTimer.current);
    _autoRunTimer.current = setTimeout(() => { _submitRef.current?.(runCount); }, delay);
    return () => { if (_autoRunTimer.current) clearTimeout(_autoRunTimer.current); };
  }, [token, dataSource, forecastPeriod.type, forecastCount, selectedInventoryId]); // eslint-disable-line

  // ── Mother item → variant → material selection ────────────────────────────
  // The inventory list is 50 flat materials in which three separate mugs and
  // six separate totebags look unrelated. Group them under the product that
  // consumes them, so the picker reads the way the shop actually thinks.
  const SHARED_KEY = "__shared__";
  const UNLINKED_KEY = "__unlinked__";

  const motherOptions = (() => {
    if (!taxonomy) return [];
    const byCategory = {};
    (taxonomy.motherItems ?? [])
      .filter((m) => m.materials?.length > 0)
      .forEach((m) => {
        const cat = m.category || "Uncategorised";
        (byCategory[cat] ??= []).push({
          id: m.productId,
          label: `${m.name}${m.materials.length > 1 ? ` (${m.materials.length})` : ""}`,
        });
      });
    const groups = Object.keys(byCategory)
      .sort()
      .map((category) => ({ category, items: byCategory[category].sort((a, b) => a.label.localeCompare(b.label)) }));

    const shared = Object.entries(taxonomy.materialIndex ?? {}).filter(([, v]) => v.shared).length;
    const extras = [];
    if (shared > 0) extras.push({ id: SHARED_KEY, label: `Shared across products (${shared})` });
    if ((taxonomy.unlinked ?? []).length > 0)
      extras.push({ id: UNLINKED_KEY, label: `Not used by any product (${taxonomy.unlinked.length})` });
    if (extras.length) groups.push({ category: "Other", items: extras });

    return groups;
  })();

  const activeMother = (taxonomy?.motherItems ?? []).find((m) => m.productId === selectedMotherId) ?? null;

  // The label the picker is showing, spelled out in full for the line beneath it.
  // Only worth repeating when the select would actually have cut it off.
  const selectedMotherLabel = (() => {
    const hit = motherOptions.flatMap((g) => g.items).find((m) => m.id === selectedMotherId);
    return hit && hit.label.length > 28 ? hit.label : "";
  })();

  // Materials shown for the current mother item, narrowed by the variant filter.
  const visibleMaterials = (() => {
    // On-demand materials used to be hidden here. They are bought per order
    // rather than held, but the owner now sets a minimum on them too, and one
    // of them - Mug Box White 11oz - is the clearest restock signal in the
    // shop. Show them, marked, instead of dropping them.
    const tracked = inventoryList;
    if (!taxonomy || !selectedMotherId) return tracked;

    if (selectedMotherId === UNLINKED_KEY) {
      const ids = new Set((taxonomy.unlinked ?? []).map((u) => u.inventoryId));
      return tracked.filter((i) => ids.has(String(i._id ?? i.id)));
    }
    if (selectedMotherId === SHARED_KEY) {
      const ids = new Set(
        Object.entries(taxonomy.materialIndex ?? {}).filter(([, v]) => v.shared).map(([k]) => k),
      );
      return tracked.filter((i) => ids.has(String(i._id ?? i.id)));
    }
    if (!activeMother) return tracked;

    const wanted = activeMother.materials.filter(
      (m) => !selectedVariant || m.variants.length === 0 || m.variants.includes(selectedVariant),
    );
    const ids = new Set(wanted.map((m) => m.inventoryId));
    return tracked.filter((i) => ids.has(String(i._id ?? i.id)));
  })();

  // Share of the family this variant took in recent orders - shown in the
  // filter itself so the split is visible before it is relied on.
  const variantShareLabel = (variant) => {
    const vs = taxonomy?.variantShares?.[selectedMotherId];
    if (!vs?.sufficient) return "";
    const share = vs.shares?.[variant];
    return share == null ? "" : ` - ${(share * 100).toFixed(0)}%`;
  };

  // Default the picker to the first mother item, and keep the chosen material
  // valid whenever the mother item or variant filter narrows the list.
  useEffect(() => {
    if (!taxonomy || motherOptions.length === 0) return;
    if (!selectedMotherId) {
      setSelectedMotherId(motherOptions[0].items[0]?.id ?? "");
    }
  }, [taxonomy]); // eslint-disable-line

  useEffect(() => {
    if (dataSource !== "inventory_stock" || visibleMaterials.length === 0) return;
    const stillValid = visibleMaterials.some((i) => String(i._id ?? i.id) === String(selectedInventoryId));
    if (!stillValid) {
      setSelectedInventoryId(String(visibleMaterials[0]._id ?? visibleMaterials[0].id));
    }
  }, [selectedMotherId, selectedVariant, dataSource, inventoryList, taxonomy]); // eslint-disable-line

  const isInvMode = submittedConfig?.source === "inventory_stock";


  const fcDatesForPicker = result?.forecast?.dates || [];
  const pickerMatchIdx  = pickerDate ? fcDatesForPicker.indexOf(pickerDate) : -1;
  const pickerMatchDate = pickerMatchIdx >= 0 ? fcDatesForPicker[pickerMatchIdx] : null;
  const todayIso        = businessToday();
  // Compare against the START of the current period, not the raw date - otherwise
  // a monthly forecast point dated "2026-06-01" is wrongly skipped when today is
  // June 22, pushing the Today marker onto July instead of the current month.
  const todayPeriodStart = (() => {
    // Anchored to the shop's calendar day, then stepped as a date string.
    const today = businessToday();
    const pt = submittedConfig?.period?.type || forecastPeriod.type;
    if (pt === "monthly")  return `${today.slice(0, 7)}-01`;
    if (pt === "annually") return `${today.slice(0, 4)}-01-01`;
    // weekly: Monday of the current week (matches backend W-MON labels)
    const now = new Date(today + "T00:00:00Z");
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    now.setUTCDate(now.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return now.toISOString().slice(0, 10);
  })();
  const todayRefDate    = fcDatesForPicker.find((d) => d >= todayPeriodStart) ?? null;
  // Actual local "today" for the marker label (weekly snaps the line to the
  // week's Monday, so the label spells out the real date to avoid confusion).
  const todayDisplay = (() => {
    const now = new Date();
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${m[now.getMonth()]} ${now.getDate()}`;
  })();
  const selectedItemName = inventoryList.find(i => (i._id ?? i.id) === selectedInventoryId)?.name ?? "";

  // Shared inventory policy (reorder point / safety stock / demand class) so the
  // chart and table use the same model numbers as the metric cards.
  const invPolicy =
    submittedConfig?.source === "inventory_stock" && result
      ? computeInventoryPolicy({
          rawRows,
          currentStock: availableQty,
          leadTimeDays: inventoryList.find((i) => (i._id ?? i.id) === selectedInventoryId)?.leadTimeDays,
          // This material's supplier, and what its receipts say the lead time is
          supplierLead: (() => {
            const sid = inventoryList.find((i) => (i._id ?? i.id) === selectedInventoryId)?.supplierId;
            return sid ? taxonomy?.supplierLeadTimes?.[String(sid)] ?? null : null;
          })(),
          periodType: submittedConfig?.period?.type ?? forecastPeriod.type,
          // Same numbers the depletion line uses, so the two cannot disagree.
          forecastValues: result?.forecast?.values,
        })
      : null;

  // How many training periods to show as historical context (before forecast)
  const HIST_SLICES = { weekly: 8, monthly: 6, annually: 3 };

  const getCombinedChartData = () => {
    if (!result) return [];
    const data = [];

    const trainDates = result.training_data?.dates || [];
    const trainValues = result.training_data?.values || [];
    const trainTrend  = result.training_data?.trend  || [];
    const trainSeas   = result.training_data?.seasonality || [];
    const fcDates  = result.forecast?.dates  || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh   = result.forecast?.confidence_high || [];
    const fcLow    = result.forecast?.confidence_low  || [];

    const histSlice = HIST_SLICES[submittedConfig?.period?.type] ?? 6;
    const startIdx  = showAllHistory ? 0 : Math.max(0, trainDates.length - histSlice);

    // Historical slice - aggregated at period granularity, unfloored values
    for (let i = startIdx; i < trainDates.length; i++) {
      const btPoint = backtestData.find((b) => b.date === trainDates[i]);
      data.push({
        date:          trainDates[i],
        Actual:        trainValues[i] != null ? Math.round(trainValues[i] * 100) / 100 : null,
        BacktestActual: btPoint ? btPoint.BacktestActual : null,
        Trend:         showTrend       ? (trainTrend[i] != null ? Math.round(trainTrend[i] * 100) / 100 : null) : undefined,
        Seasonality:   showSeasonality ? (trainSeas[i]  != null ? Math.round(trainSeas[i]  * 100) / 100 : null) : undefined,
        Forecast: null, High: null, Low: null,
      });
    }

    // Fill the gap between the last recorded sale and today (or the forecast
    // start) with explicit ZERO-sales periods. The backend trims trailing empty
    // periods, so without this the chart shows a blank gap that hides the fact
    // that there were simply no sales on those days - those 0-sales periods must
    // be drawn, not left empty, or the timeline looks broken / stuck in the past.
    if (trainDates.length > 0) {
      const hasCount = parseInt(forecastCount, 10) > 0;
      const pt = submittedConfig?.period?.type || forecastPeriod.type;
      const stepDate = (iso) => {
        const d = new Date(iso + "T00:00:00Z");
        if (pt === "weekly") d.setUTCDate(d.getUTCDate() + 7);
        else if (pt === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
        else d.setUTCFullYear(d.getUTCFullYear() + 1);
        return d.toISOString().slice(0, 10);
      };
      // When a forecast exists, stop just before its first period so we don't
      // overwrite it; otherwise fill through today's period (inclusive).
      const stopBefore = hasCount && fcDates.length > 0 ? fcDates[0] : null;
      const fillThrough = todayRefDate || todayPeriodStart;
      let cur = stepDate(trainDates[trainDates.length - 1]);
      let guard = 0;
      while (guard < 520 && (stopBefore ? cur < stopBefore : cur <= fillThrough)) {
        data.push({
          date: cur, Actual: 0, BacktestActual: null,
          Trend: undefined, Seasonality: undefined,
          Forecast: null, High: null, Low: null,
        });
        cur = stepDate(cur);
        guard++;
      }
    }

    // Forecast - only included when user has a count entered
    if (parseInt(forecastCount, 10) > 0) {
      for (let i = 0; i < fcDates.length; i++) {
        data.push({
          date:          fcDates[i],
          Actual:        null,
          BacktestActual: null,
          Trend:         undefined,
          Seasonality:   undefined,
          Forecast:      fcValues[i] != null ? Math.round(fcValues[i] * 100) / 100 : null,
          High:          showConfidence ? (fcHigh[i] != null ? Math.round(fcHigh[i] * 100) / 100 : null) : null,
          Low:           showConfidence ? (fcLow[i]  != null ? Math.round(fcLow[i]  * 100) / 100 : null) : null,
          // One [low, high] pair so the interval draws as a single shaded
          // region. Two separate lines read as two more series competing
          // with the forecast; a band reads as uncertainty around it.
          Band:          showConfidence && fcHigh[i] != null && fcLow[i] != null
            ? [Math.round(fcLow[i] * 100) / 100, Math.round(fcHigh[i] * 100) / 100]
            : null,
        });
      }
    }

    data.sort((a, b) => a.date.localeCompare(b.date));
    return data;
  };

  const getDecompChartData = () => {
    if (!result) return [];
    const dates       = result.training_data?.dates       || [];
    const trend       = result.training_data?.trend       || [];
    const seasonality = result.training_data?.seasonality || [];
    const noise       = result.training_data?.noise       || [];
    const histSlice   = HIST_SLICES[submittedConfig?.period?.type] ?? 6;
    const startIdx    = showAllHistory ? 0 : Math.max(0, dates.length - histSlice);
    return dates.slice(startIdx).map((date, i) => ({
      date,
      Trend:       trend[startIdx + i]       ?? null,
      Seasonality: seasonality[startIdx + i] ?? null,
      Noise:       noise[startIdx + i]       ?? null,
    }));
  };

  const getInventoryChartData = () => {
    const todayStr = businessToday();
    const data = [];

    // Left side: forward-fill stock history events into a staircase up to today
    if (stockHistoryRows.length > 0) {
      const eventMap = {};
      stockHistoryRows.forEach(r => { eventMap[r.date] = r.value; });
      const allDates = Object.keys(eventMap).sort();
      const cur = new Date(allDates[0] + "T00:00:00Z");
      let lastQty = eventMap[allDates[0]];
      while (cur.toISOString().split("T")[0] <= todayStr) {
        const ds = cur.toISOString().split("T")[0];
        if (eventMap[ds] !== undefined) lastQty = eventMap[ds];
        data.push({ date: ds, StockActual: lastQty, StockForecast: null });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else {
      // No history - anchor at today with current stock level
      data.push({ date: todayStr, StockActual: currentStockQty ?? 0, StockForecast: null });
    }

    // Right side: subtract SSA-forecasted demand from current stock to get projected
    // remaining. Only drawn once the user enters a look-ahead - no auto-projection
    // on load. Until then the chart shows just the recorded stock staircase up to today.
    if (result && currentStockQty !== null && parseInt(forecastCount, 10) > 0) {
      // Anchor the projection at today so the gold line starts from the current
      // stock base (the boundary between recorded history and the forecast).
      // Anchor on the shelf count, not on the available count, so the gold line
      // starts where the recorded staircase ends. Anchoring on available left a
      // cliff at today the size of whatever was reserved.
      if (data.length > 0) data[data.length - 1].StockForecast = currentStockQty;
      const fcDates  = result.forecast?.dates  || [];
      const fcValues = result.forecast?.values || [];
      // Stock promised to open orders leaves the shelf whatever the forecast
      // does, so take it off once at the start rather than ignoring it.
      let remaining = Math.max(0, currentStockQty - reservedQty);
      for (let i = 0; i < fcDates.length; i++) {
        if (fcDates[i] <= todayStr) continue;
        remaining = Math.max(0, remaining - Math.max(0, fcValues[i] ?? 0));
        data.push({ date: fcDates[i], StockActual: null, StockForecast: Math.round(remaining) });
      }
    }

    data.sort((a, b) => a.date.localeCompare(b.date));
    return data;
  };

  const formatDateLabel = (dateString, periodType, forceDaily = false) => {
    if (!dateString) return dateString;
    const d = new Date(dateString + "T00:00:00Z");
    if (isNaN(d)) return dateString;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const year = d.getUTCFullYear();
    const pt =
      periodType || submittedConfig?.period?.type || forecastPeriod.type;
    if (forceDaily) return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${year}`;
    // The ISO year, not `year` - a week-of-year number only means something
    // against the ISO year, and the two differ in the first and last week.
    if (pt === "weekly") {
      const { week, isoYear } = getISOWeekParts(d);
      return `W${week} ${isoYear}`;
    }
    if (pt === "monthly") return `${months[d.getUTCMonth()]} ${year}`;
    if (pt === "annually") return `${year}`;
    return dateString;
  };

  const chartDateFormatter = (dateString) => {
    if (!dateString) return "";
    const base = formatDateLabel(dateString, submittedConfig?.period?.type, false);
    const pt = submittedConfig?.period?.type || forecastPeriod.type;
    if (pt === "weekly") {
      const d = new Date(dateString + "T00:00:00Z");
      if (!isNaN(d)) {
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${base}  ·  ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
      }
    }
    return base;
  };

  const yAxisFormatter = (v) => {
    const src = submittedConfig?.source ?? dataSource;
    if (src === "inventory_stock") {
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "K units";
      return Math.round(v) + " units";
    }
    const prefix = src === "sales_revenue" ? "\u20b1" : "";
    if (Math.abs(v) >= 1000000) return prefix + (v / 1000000).toFixed(1) + "M";
    if (Math.abs(v) >= 1000) return prefix + (v / 1000).toFixed(1) + "K";
    return prefix + v.toFixed(0);
  };

  // ── Unit-aware value formatting ───────────────────────────────────────
  // Revenue is money (₱, 2 decimals); Quantity and Inventory are discrete
  // whole units - you can't sell 0.82 of an item, so they round to integers.
  const isMoneySource = (src) => src === "sales_revenue";
  const fmtSourceValue = (v, src, withUnit = false) => {
    if (v == null || Number.isNaN(v)) return "-";
    if (isMoneySource(src))
      return "₱" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const n = Math.round(v).toLocaleString("en-US");
    return withUnit ? `${n} units` : n;
  };

  const handleDownloadCSV = () => {
    if (!result || !submittedConfig) return;
    const fcDates = result.forecast?.dates || [];
    const fcValues = result.forecast?.values || [];
    const fcHigh = result.forecast?.confidence_high || [];
    const fcLow = result.forecast?.confidence_low || [];
    const money = isMoneySource(submittedConfig.source);
    const fmtCsv = (v) => (v == null ? "" : money ? v.toFixed(2) : Math.round(v));
    const valueHeader = money ? "Predicted Value" : "Predicted Units";
    let csv = `${submittedConfig.period.tableHeader},Date,${valueHeader},Upper Bound,Lower Bound\n`;
    fcDates.forEach((d, i) => {
      csv += `${i + 1},${d},${fmtCsv(fcValues[i])},${fmtCsv(fcHigh[i])},${fmtCsv(fcLow[i])}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ssa_forecast_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = () => {
    const node = chartRef.current;
    if (!node || !submittedConfig) return;
    // Read the live theme background so exports look correct in light & dark mode
    const bg =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--dark2")
        .trim() || "#1a1a1a";
    import("html2canvas").then(({ default: html2canvas }) => {
      html2canvas(node, { backgroundColor: bg }).then((canvas) => {
        const a = document.createElement("a");
        a.download = `ssa_chart_${submittedConfig.source}_${submittedConfig.count}${submittedConfig.period.type[0]}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      });
    });
  };

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="ssa-page-header">
          <div>
            <h1 className="ssa-page-title">Business Analytics</h1>
          </div>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="ssa-tab-nav">
          <TabBar
            tabs={[
              { id: "forecast", label: "Demand Forecast" },
              { id: "segments", label: "Customer Segments" },
              { id: "products", label: "Products & Services" },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === "forecast" && (
        <>

        {/* ── Two-column workspace ───────────────────────────────────────────── */}
        <div className="ssa-layout">
          {/* ════════ Left control sidebar ════════ */}
          <aside className="ssa-sidebar">
            {/* Data Source */}
            <div>
              <p className="ssa-side-label">Data Source</p>
              <div className="ssa-source-list">
                {DATA_SOURCES.map((s) => {
                  const icons = {
                    sales_revenue: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="1" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
                    ),
                    sales_qty: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
                    ),
                    inventory_stock: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                    ),
                  };
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`ssa-source-vbtn ${dataSource === s.key ? "active" : ""}`}
                      onClick={() => {
                        setDataSource(s.key);
                        setDynamicMaxCount(forecastPeriod.maxCount);
                        setForecastCount("");   // reset look-ahead when data source changes
                        setResult(null);
                        setSubmittedConfig(null);
                        setError("");
                      }}
                    >
                      {icons[s.key]}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inventory item picker (inventory mode only) - nested mother item
                → variant → material, so the 50 flat materials read as the ~24
                products they actually belong to. */}
            {dataSource === "inventory_stock" && (
              <>
                <div>
                  <p className="ssa-side-label">Mother Item</p>
                  <select
                    className="ssa-select"
                    style={{ width: "100%", minWidth: 0 }}
                    value={selectedMotherId}
                    onChange={(e) => {
                      setSelectedMotherId(e.target.value);
                      setSelectedVariant("");
                      setForecastCount("");
                      setResult(null);
                      setSubmittedConfig(null);
                    }}
                  >
                    {motherOptions.map((g) => (
                      <optgroup key={g.category} label={g.category}>
                        {g.items.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {/* A closed <select> truncates to its own width, and this sidebar
                      is 256px while the longest product name needs about 454px at
                      this size - so "Custom Vinyl Sticker Laminated Scratchproof
                      (Kisscut/Diecut)" and "...Waterproof..." cut to the same
                      visible text. Repeat the full name underneath, where it can
                      wrap, so the choice is readable without hovering. */}
                  {selectedMotherLabel && (
                    <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: 1.4, color: "var(--gray)" }}>
                      {selectedMotherLabel}
                    </p>
                  )}
                </div>

                {/* Variant filter - only where the mother item actually has variants */}
                {activeMother?.variants?.length > 0 && (
                  <div>
                    <p className="ssa-side-label">Variant</p>
                    <CustomSelect
                      value={selectedVariant}
                      placeholder={`All variants (${activeMother.variants.length})`}
                      options={activeMother.variants.map((v) => ({ value: v, label: `${v}${variantShareLabel(v)}` }))}
                      onChange={(v) => {
                        setSelectedVariant(v);
                        setForecastCount("");
                        setResult(null);
                        setSubmittedConfig(null);
                      }}
                    />
                  </div>
                )}

                <div>
                  <p className="ssa-side-label">
                    Material{visibleMaterials.length > 1 ? ` (${visibleMaterials.length})` : ""}
                  </p>
                  <CustomSelect
                    value={selectedInventoryId}
                    searchable
                    options={visibleMaterials.map((item) => {
                      const isLow = (item.stockQty ?? 0) <= (item.minStockLevel ?? 0);
                      return {
                        value: item._id ?? item.id,
                        label: `${item.name}${isLow ? ` (${item.stockQty ?? 0} left)` : ""}${item.isOnDemand ? " - bought per order" : ""}`,
                      };
                    })}
                    onChange={(v) => {
                      setSelectedInventoryId(v);
                      setForecastCount("");
                      setResult(null);
                      setSubmittedConfig(null);
                    }}
                  />
                </div>
              </>
            )}

            {/* Forecast Period + Look-ahead + Run */}
            <>
                <div>
                  <p className="ssa-side-label">Forecast Period</p>
                  <div className="ssa-segmented">
                    {FORECAST_PERIODS.map((p) => (
                      <button
                        key={p.type}
                        type="button"
                        className={`ssa-seg-btn ${forecastPeriod.type === p.type ? "active" : ""}`}
                        aria-pressed={forecastPeriod.type === p.type}
                        onClick={() => {
                          setForecastPeriod(p);
                          setDynamicMaxCount(p.maxCount);
                          setForecastCount("");   // reset look-ahead when period changes
                          setResult(null);
                          setSubmittedConfig(null);
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="ssa-side-label">Look-Ahead</p>
                  <div className="ssa-lookahead">
                    <input
                      type="number"
                      min={1}
                      max={dynamicMaxCount}
                      value={forecastCount}
                      placeholder="e.g. 4"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") { setForecastCount(""); return; }
                        const v = parseInt(raw, 10);
                        if (!isNaN(v) && v > 0 && v <= dynamicMaxCount) setForecastCount(v);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    />
                    <span className="unit">
                      {forecastPeriod.type === "weekly" ? "wks" : forecastPeriod.type === "monthly" ? "mos" : "yrs"}
                    </span>
                  </div>
                  <p className="ssa-side-hint">Max {dynamicMaxCount} {forecastPeriod.unit}</p>
                </div>

                <button
                  type="button"
                  className="ssa-primary-btn"
                  disabled={isLoading}
                  onClick={() => handleSubmit()}
                >
                  {isLoading ? (
                    <>
                      <svg className="ssa-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      Running…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      Run Forecast
                    </>
                  )}
                </button>
              </>

            {/* Model info - populated after a successful sales forecast */}
            {dataSource !== "inventory_stock" && result && submittedConfig?.source === dataSource && (
              <>
                <div className="ssa-side-divider" />
                <div>
                  <p className="ssa-side-label">Model Info</p>
                  <div className="ssa-model-info">
                    <div className="ssa-model-row">
                      <span className="k">Series</span>
                      <span className="v">
                        {submittedConfig?.sourceLabel}
                        <span style={{ color: "var(--gray)", fontWeight: 400, marginLeft: "4px" }}>
                          {isMoneySource(submittedConfig?.source) ? "(₱)" : "(units)"}
                        </span>
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Training data</span>
                      <span className="v">
                        {trainingPeriods != null
                          ? `${trainingPeriods} ${result?.training_unit ?? submittedConfig?.period?.unit ?? "periods"}`
                          : `${dataPointCount}`}
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Raw records</span>
                      <span className="v">{dataPointCount.toLocaleString("en-US")}</span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Auto window (L)</span>
                      <span className="v gold">{result?.auto_L?.L_used ?? "-"}</span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">
                        <span className="ssa-tooltip">
                          Period detected
                          <span style={{ marginLeft: "4px", opacity: 0.5, display: "inline-flex", verticalAlign: "middle" }}>{ICONS.info}</span>
                          <span className="ssa-tooltip-text" style={{ left: 0, transform: "none", width: 210 }}>
                            How often your sales pattern repeats, based on your past sales. The model finds it automatically - it has nothing to do with how far ahead you forecast.
                          </span>
                        </span>
                      </span>
                      <span className="v">
                        {result?.auto_L?.period_detected ? `${result.auto_L.period_detected} steps` : "-"}
                      </span>
                    </div>
                    <div className="ssa-model-row">
                      <span className="k">Algorithm</span>
                      <span className="v" style={{ fontSize: "11px", letterSpacing: "0.5px", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: "6px" }}>SSA</span>
                    </div>
                    {/* Direction metrics. The service has computed these all along and
                        nothing showed them. They are NOT classification scores: each
                        backtest period is called high or low against the median actual,
                        and these say how often that call was right. Labelled as such,
                        because "precision 0.5" invites being read as something else. */}
                    {result?.accuracy?.precision != null && (
                      <>
                        <div className="ssa-model-row">
                          <span className="k">
                            <span className="ssa-tooltip">
                              Busy periods caught
                              <span style={{ marginLeft: "4px", opacity: 0.5, display: "inline-flex", verticalAlign: "middle" }}>{ICONS.info}</span>
                              <span className="ssa-tooltip-text" style={{ left: 0, transform: "none", width: 230 }}>
                                Of the periods that really were busier than usual, how many the
                                forecast also called busy (recall). Of the ones it called busy,
                                how many really were (precision). F1 combines the two.
                              </span>
                            </span>
                          </span>
                          <span className="v">
                            {Math.round(result.accuracy.recall * 100)}%
                            <span style={{ color: "var(--gray)", fontWeight: 400, marginLeft: "4px" }}>
                              of {result.accuracy.mape_total ?? "-"}
                            </span>
                          </span>
                        </div>
                        <div className="ssa-model-row">
                          <span className="k">Right when it said busy</span>
                          <span className="v">{Math.round(result.accuracy.precision * 100)}%</span>
                        </div>
                        <div className="ssa-model-row">
                          <span className="k">F1 (the two combined)</span>
                          <span className="v">{result.accuracy.f1?.toFixed(2) ?? "-"}</span>
                        </div>
                      </>
                    )}
                    <div className="ssa-model-row">
                      <span className="k">Last run</span>
                      <span className="v">
                        {lastRunAt
                          ? lastRunAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Export - available once a forecast with values exists */}
            {dataSource !== "inventory_stock" && result && submittedConfig?.source === dataSource && parseInt(forecastCount, 10) > 0 && (
              <>
                <div className="ssa-side-divider" />
                <div>
                  <p className="ssa-side-label">Export</p>
                  <button type="button" className="ssa-export-btn" style={{ marginBottom: "8px" }} onClick={handleDownloadCSV}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Download CSV
                  </button>
                  <button type="button" className="ssa-export-btn" onClick={handleDownloadPNG}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    Download PNG
                  </button>
                </div>
              </>
            )}
          </aside>

          {/* ════════ Right results column ════════ */}
          <div className="ssa-main">
            {error && (
              <div className="ssa-error" style={{ marginTop: 0, marginBottom: "24px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

        {/* ── Inventory Stock Level overview ───────────────────────────────── */}
        {dataSource === "inventory_stock" && (() => {
          // Count what the picker offers. On-demand materials were excluded
          // here as well, which hid genuinely low ones - Mug Box White 11oz
          // sits at 10 against a minimum of 31 and never appeared.
          const tracked = inventoryList;
          const outItems = tracked.filter((i) => (i.stockQty ?? 0) === 0);
          const lowItems = tracked.filter(
            (i) => (i.stockQty ?? 0) > 0 && (i.stockQty ?? 0) <= (i.minStockLevel ?? 0),
          );

          return (
            <div style={{ marginBottom: "24px" }}>
              <p className="ssa-side-label" style={{ marginBottom: "10px" }}>
                Inventory Status · across all {tracked.length} materials
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                {[
                  { label: "Materials", value: tracked.length, color: "var(--white)" },
                  { label: "Low Stock", value: lowItems.length, color: "var(--color-text-warning)", hint: "at/below reorder point" },
                  { label: "Out of Stock", value: outItems.length, color: "var(--st-red-fg)", hint: "zero on hand" },
                ].map(({ label, value, color, hint }) => (
                  <SummaryCard key={label} label={label} value={value} sub={hint} color={color} />
                ))}
              </div>
            </div>
          );
        })()}

        {(isLoading || (result && submittedConfig && submittedConfig.source === dataSource)) &&
          (() => {
            const firstLoad = isLoading && !result;
            const hasForecastCount = parseInt(forecastCount, 10) > 0;
            const vals = result?.historical?.values || [];
            // last_period_value is the unfloored weekly aggregate for the last
            // training period - meaningful for weekly forecast context.
            const lastVal =
              result?.last_period_value ??
              (vals.length > 0 ? vals[vals.length - 1] : null);
            const isRevenue =
              (result ? submittedConfig?.source : dataSource) ===
              "sales_revenue";
            const isInvCard =
              (result ? submittedConfig?.source : dataSource) ===
              "inventory_stock";

            // Pass is_high_volatility so resolveAccuracy can adjust tooltip + color
            const acc = resolveAccuracy(
              result?.accuracy,
              result?.is_high_volatility ?? false,
            );
            const mae = result?.accuracy?.mae;
            const rmse = result?.accuracy?.rmse;
            const fcDatesM = result?.forecast?.dates || [];
            const horizonRange = fcDatesM.length
              ? `${formatDateLabel(fcDatesM[0], submittedConfig?.period?.type, true)} - ${formatDateLabel(fcDatesM[fcDatesM.length - 1], submittedConfig?.period?.type, true)}`
              : null;

            // ── Inventory-native figures (only used when isInvCard) ──
            const invSelItem = inventoryList.find((i) => (i._id ?? i.id) === selectedInventoryId);
            const reorderPt = invSelItem?.minStockLevel ?? null;
            const fcVals = result?.forecast?.values || [];
            const avgDemand = fcVals.length
              ? fcVals.reduce((s, v) => s + (v ?? 0), 0) / fcVals.length
              : null;
            const unitSingular = (submittedConfig?.period?.unit ?? forecastPeriod.unit).replace(/s$/, "");
            let invStockoutDate = null, invPeriodsToOut = null;
            if (isInvCard && result && availableQty != null) {
              const fcD = result.forecast?.dates || [];
              const todayStr = businessToday();
              // Float, not per-period rounding - see the stockout effect above.
              let rem = availableQty, n = 0;
              for (let i = 0; i < fcD.length; i++) {
                if (fcD[i] <= todayStr) continue;
                rem -= Math.max(0, fcVals[i] ?? 0);
                n++;
                if (rem <= 0) { invStockoutDate = fcD[i]; invPeriodsToOut = n; break; }
              }
            }
            const stockStatus = isInvCard && currentStockQty != null
              ? (currentStockQty === 0 ? "out" : (reorderPt != null && reorderPt > 0 && availableQty <= reorderPt ? "low" : "ok"))
              : "ok";
            const stockColor = stockStatus === "out" ? "var(--st-red-fg)" : stockStatus === "low" ? "var(--st-amber-fg)" : "var(--gold)";
            const policy = invPolicy;
            const belowROP = policy && availableQty != null && availableQty <= policy.ROP;
            const invColor = currentStockQty === 0 ? "var(--st-red-fg)" : belowROP ? "var(--st-amber-fg)" : "var(--gold)";
            let reorderByLabel = "-";
            if (policy && currentStockQty != null) {
              if (currentStockQty === 0 || belowROP) reorderByLabel = "Now";
              else if (policy.d > 0) {
                const _dt = new Date();
                _dt.setUTCDate(_dt.getUTCDate() + Math.round(policy.periodsToROP * policy.daysPerPeriod));
                const _m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                reorderByLabel = `${_m[_dt.getUTCMonth()]} ${_dt.getUTCDate()}, ${_dt.getUTCFullYear()}`;
              }
            }
            const clsInfo = policy ? (DEMAND_CLASS[policy.cls] ?? DEMAND_CLASS.new) : null;

            return isInvCard ? (
              <>
              <div className="ssa-metric-cards">
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Current Stock</div>
                  {firstLoad ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: invColor, fontSize: "22px" }}>
                        {currentStockQty != null ? `${currentStockQty.toLocaleString("en-US")} units` : "-"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px" }}>
                        {currentStockQty === 0
                          ? "Out of stock"
                          : `${belowROP ? "At/below reorder point" : "Above reorder point"}${
                              reservedQty > 0 ? ` - ${availableQty} free, ${reservedQty} reserved` : ""
                            }`}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Reorder Point</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: "var(--gold)", fontSize: "22px" }}>
                        {policy.ROP.toLocaleString("en-US")} units
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px" }}>
                        manual: {reorderPt != null && reorderPt > 0 ? `${reorderPt.toLocaleString("en-US")} units` : "not set"}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Reorder By</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: reorderByLabel === "Now" ? "var(--st-red-fg)" : "var(--white)", fontSize: reorderByLabel === "Now" ? "22px" : "16px" }}>
                        {reorderByLabel === "Now" && (
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--st-red-fg)", marginRight: 7, verticalAlign: "middle" }} />
                        )}
                        {reorderByLabel}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px" }}>
                        {policy.leadSource === "measured"
                          ? `lead time ${policy.leadDays}d ± ${policy.sigmaLeadDays}d, measured from this vendor's deliveries`
                          : policy.leadSource === "typed"
                            ? `lead time ${policy.leadDays}d, as typed on the material`
                            : `lead time ${policy.leadDays}d assumed - record "Ordered On" at stock-in to measure it`}
                      </div>
                    </>
                  )}
                </div>
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Suggested Order</div>
                  {firstLoad || !policy ? <div className="ssa-skeleton" /> : (
                    <>
                      <div className="ssa-stat-value" style={{ color: "var(--gold)", fontSize: "22px" }}>
                        {policy.orderQty.toLocaleString("en-US")} units
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px" }}>
                        {policy.orderQty > 0 ? "to cover lead + buffer" : "stock sufficient"}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {!firstLoad && policy && (
                <>
                <p className="ssa-side-label" style={{ margin: "4px 0 8px" }}>Demand Profile</p>
                <div className="ssa-units-summary" style={{ alignItems: "flex-start", gap: "24px" }}>
                  <div style={{ flex: "0 1 200px" }}>
                    <span className="k">Demand Pattern</span>
                    <span
                      className="ssa-rfm-badge"
                      style={{ background: `${clsInfo.color}1f`, color: clsInfo.color, border: `1px solid ${clsInfo.color}40`, alignSelf: "flex-start" }}
                    >
                      {clsInfo.label}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--gray)", lineHeight: 1.4, marginTop: "4px" }}>
                      {clsInfo.note}
                    </span>
                  </div>
                  <div>
                    <span className="k">Sells about</span>
                    <span className="v">
                      {fmtDemand(policy.d)}
                      <span style={{ fontWeight: 400, color: "var(--gray)", fontSize: "13px" }}> /{unitSingular}</span>
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--gray)", lineHeight: 1.4 }}>
                      {estimatePhrase(result)}
                    </span>
                  </div>
                  <div>
                    <span className="k">Stock lasts</span>
                    <span className="v">{coveragePhrase(policy.coverage, unitSingular, policy.daysPerPeriod)}</span>
                    <span style={{ fontSize: "12px", color: "var(--gray)", lineHeight: 1.4 }}>
                      {reservedQty > 0
                        ? `at this rate, from the ${availableQty} free to use (${reservedQty} reserved)`
                        : "at this rate, with no restock"}
                    </span>
                  </div>
                  {isInvCard && demandBasis && (
                    <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                      <span className="k">Counted from</span>
                      <span className="v" style={{ fontSize: "13px", fontWeight: 500, lineHeight: 1.4 }}>
                        {demandBasis.source === "ledger"
                          ? "Stock taken off the shelf"
                          : demandBasis.consumers.length === 0
                            ? "no sales yet"
                            : `Sales of ${demandBasis.consumers.slice(0, 2).join(", ")}${demandBasis.consumers.length > 2 ? ` +${demandBasis.consumers.length - 2} more` : ""}`}
                      </span>
                      {demandBasis.source === "ledger" ? (
                        <span style={{ fontSize: "12px", color: "var(--gray)", lineHeight: 1.4 }}>
                          recorded from {formatDateLabel(demandBasis.ledgerFrom, "daily")} onward
                          {demandBasis.crossCheck?.diverges
                            ? `; sales over the same weeks suggest ${fmtDemand(demandBasis.crossCheck.salesRate)}/week, so some was used without a sale`
                            : ""}
                        </span>
                      ) : (demandBasis.even > 0 || demandBasis.share > 0) ? (
                        <span style={{ fontSize: "12px", color: "var(--gray)", lineHeight: 1.4 }}>
                          {demandBasis.even + demandBasis.share} older sale
                          {demandBasis.even + demandBasis.share === 1 ? "" : "s"} recorded no variant
                          {demandBasis.even > 0 ? "; shared out evenly" : "; split by recent mix"}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                </>
              )}
              </>
            ) : (
              <div className="ssa-metric-cards">
                {/* 1 - Forecast accuracy */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">
                    <span className="ssa-tooltip">
                      {acc.label}
                      <span style={{ marginLeft: "4px", opacity: 0.5, display: "inline-flex", verticalAlign: "middle" }}>{ICONS.info}</span>
                      <span className="ssa-tooltip-text">{acc.tooltip}</span>
                    </span>
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : result && hasForecastCount ? (
                    <>
                      <div className="ssa-stat-value" style={{ color: acc.color, fontSize: "22px" }}>
                        {acc.display ?? "N/A"}
                        {result?.forecast_dampened && (
                          <span style={{ fontSize: "11px", color: "var(--st-amber-fg)", marginLeft: "6px", fontWeight: 400, verticalAlign: "middle" }}>
                            dampened
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px", lineHeight: 1.4 }}>
                        {acc.sublabel}
                      </div>
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "22px" }}>&mdash;</div>
                  )}
                </div>

                {/* 2 - MAE */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">MAE ({forecastPeriod.unit.replace(/s$/, "")})</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : result && hasForecastCount ? (
                    <>
                      <div className="ssa-stat-value" style={{ fontSize: "22px" }}>
                        {mae != null
                          ? fmtSourceValue(mae, submittedConfig?.source ?? dataSource, true)
                          : "N/A"}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px" }}>
                        {/* RMSE sits beside MAE rather than in a card of its own: same units,
                            same question. It weighs one large miss more heavily, which is the
                            difference worth seeing on spiky demand. */}
                        Mean absolute error
                        {rmse != null && (
                          <>
                            {" · RMSE "}
                            {fmtSourceValue(rmse, submittedConfig?.source ?? dataSource, true)}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "22px" }}>&mdash;</div>
                  )}
                </div>

                {/* 3 - Last period value / current stock */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">
                    {(result ? submittedConfig?.source : dataSource) === "inventory_stock"
                      ? "Current Stock Level"
                      : isRevenue
                      ? forecastPeriod.type === "weekly"
                        ? "Last 7-Day Revenue"
                        : forecastPeriod.type === "monthly"
                        ? "Last 30-Day Revenue"
                        : "Last Recorded Year Value"
                      : forecastPeriod.type === "weekly"
                      ? "Last 7-Day Quantity"
                      : forecastPeriod.type === "monthly"
                      ? "Last 30-Day Quantity"
                      : "Last Year Quantity"}
                  </div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gold)" }}>
                      {isInvCard
                        ? (currentStockQty !== null ? `${currentStockQty.toLocaleString("en-US")} units` : "\u2014")
                        : fmtSourceValue(lastVal, submittedConfig?.source ?? dataSource, true)}
                    </div>
                  )}
                </div>

                {/* 4\u2014 Forecast horizon */}
                <div className="ssa-metric-card">
                  <div className="ssa-stat-label">Forecast Horizon</div>
                  {firstLoad ? (
                    <div className="ssa-skeleton" />
                  ) : hasForecastCount && submittedConfig ? (
                    <>
                      <div className="ssa-stat-value" style={{ fontSize: "22px" }}>
                        {submittedConfig.count}{" "}
                        <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--gray)" }}>
                          {submittedConfig.period.unit}
                        </span>
                      </div>
                      {horizonRange && (
                        <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "4px", lineHeight: 1.4 }}>
                          {horizonRange}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ssa-stat-value" style={{ color: "var(--gray)", fontSize: "22px" }}>&mdash;</div>
                  )}
                </div>
              </div>
            );
          })()}

        {result && submittedConfig && submittedConfig.source === dataSource && (
          <>
            {/* ── Inventory depletion status banners ─────────────────────── */}
            {isInvMode && stockoutDate && parseInt(forecastCount, 10) > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: "8px", padding: "12px 20px", fontSize: "14px", color: "var(--gray)", lineHeight: 1.6, marginBottom: "24px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--st-red-fg)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  <strong style={{ color: "var(--st-red-fg)" }}>Predicted stockout -</strong>{" "}
                  Based on current demand trends, <strong style={{ color: "var(--white)" }}>{selectedItemName}</strong> is projected to run out around{" "}
                  <strong style={{ color: "var(--white)" }}>{formatDateLabel(stockoutDate, submittedConfig?.period?.type)}</strong>.{" "}
                  Consider restocking soon.
                </span>
              </div>
            )}
            {isInvMode && invPolicy?.overstocked && (
              <div className="ssa-warning-banner">
                <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--st-blue-fg)" }}>{ICONS.info}</span>
                <span>
                  <strong style={{ color: "var(--st-blue-fg)" }}>More than you are likely to use -</strong>{" "}
                  at the current rate this is about{" "}
                  <strong style={{ color: "var(--white)" }}>
                    {Math.round(invPolicy.coverage)} {forecastPeriod.unit}
                  </strong>{" "}of cover, against the {Math.round(invPolicy.L + invPolicy.R)} it needs to
                  cover delivery and the next buying trip - about{" "}
                  <strong style={{ color: "var(--white)" }}>{invPolicy.excessQty}</strong> over the order-up-to
                  level. Not urgent; just money sitting still, and worth skipping on the next order.
                </span>
              </div>
            )}
            {result?.accuracy?.anomaly && (
              <div className="ssa-warning-banner">
                <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--st-amber-fg)" }}>{ICONS.warn}</span>
                <span>
                  <strong style={{ color: "var(--st-amber-fg)" }}>
                    The last {forecastPeriod.unit.replace(/s$/, "")} came in {result.accuracy.anomaly.direction}
                    {" "}what was expected -
                  </strong>{" "}
                  {fmtSourceValue(result.accuracy.anomaly.actual, submittedConfig?.source ?? dataSource, true)}{" "}
                  against{" "}
                  {fmtSourceValue(result.accuracy.anomaly.expected, submittedConfig?.source ?? dataSource, true)},
                  about {result.accuracy.anomaly.times_typical}x this model&apos;s usual miss. Worth a look
                  before trusting the next forecast - one unusual period pulls it along.
                </span>
              </div>
            )}
            {(result?.accuracy?.training_gap ?? 0) > 0 && (
              <div className="ssa-warning-banner">
                <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--st-amber-fg)" }}>{ICONS.warn}</span>
                <span>
                  <strong style={{ color: "var(--st-amber-fg)" }}>Part of the history is blank -</strong>{" "}
                  {result.accuracy.training_gap} periods in a row have nothing recorded. The forecast cannot
                  tell those apart from periods with no demand, so it learns from a drop that may
                  never have happened. Treat the accuracy figure as provisional until the history
                  runs without a break.
                </span>
              </div>
            )}
            {/* Only the two states with nothing to forecast get a banner. The
                ordinary case - how fast it sells, how it was estimated, and
                which sales it was counted from - is read off the Demand
                Profile instead of being stacked in notices above the chart. */}
            {isInvMode && (depletionMethod === "unlinked" || depletionMethod === "nodemand") && parseInt(forecastCount, 10) > 0 && (
              <div className="ssa-warning-banner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--st-amber-fg)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  {depletionMethod === "unlinked" ? (
                    <>
                      <strong style={{ color: "var(--st-amber-fg)" }}>Nothing uses this material -</strong>{" "}
                      no product recipe includes <strong style={{ color: "var(--white)" }}>{selectedItemName}</strong>,
                      so there are no sales to work from. Add it to a product's recipe to see when it will run out.
                    </>
                  ) : (
                    <>
                      <strong style={{ color: "var(--st-amber-fg)" }}>Not sold yet -</strong>{" "}
                      <strong style={{ color: "var(--white)" }}>{selectedItemName}</strong> is part of a product,
                      but none of those products have sold, so there is nothing to project from.
                    </>
                  )}
                </span>
              </div>
            )}

            {/* The sales endpoint caps at 10,000 rows newest-first, so an
                overflow silently removes the oldest history - the part the
                model trains on. Rare today at a few hundred rows, but it must
                not pass unnoticed when it happens. */}
            {salesTruncated && (
              <div className="ssa-warning-banner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--st-amber-fg)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong style={{ color: "var(--st-amber-fg)" }}>Not all sales were read -</strong>{" "}
                  the sales list stopped at its 10,000-row limit, and the rows left out are the
                  oldest ones. The forecast is training on a shortened history.
                </span>
              </div>
            )}

            {!isInvMode && ((parseInt(forecastCount, 10) > 0 && result?.data_quality?.is_low_confidence) ||
              result?.data_quality?.trim_warning ||
              result?.is_high_volatility ||
              result?.forecast_dampened) && (
            <div className="ssa-alerts-group">
            {parseInt(forecastCount, 10) > 0 &&
              result?.data_quality?.is_low_confidence && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.3)",
                    borderRadius: "8px",
                    padding: "12px 20px",
                    fontSize: "14px",
                    color: "var(--gray)",
                    lineHeight: 1.6,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--st-amber-fg)"
                    strokeWidth="2"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    <strong style={{ color: "var(--st-amber-fg)" }}>
                      Limited historical data -
                    </strong>{" "}
                    This forecast is based on only{" "}
                    {result.data_quality.hist_agg_count}{" "}
                    {submittedConfig.period.unit} of historical data. SSA
                    forecasting is most reliable with 5 or more{" "}
                    {submittedConfig.period.unit}. Treat this forecast as
                    directional only.
                  </span>
                </div>
              )}

            {result?.data_quality?.trim_warning && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--st-amber-fg)"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{result.data_quality.trim_warning}</span>
              </div>
            )}

            {/* ── High-volatility warning ── */}
            {/* Shown when CV > 1.5: the data is spike-driven, SSA tracks trend only. */}
            {/* Rendered BEFORE the dampening banner so it reads top-down: */}
            {/* 1. What kind of data this is  2. What the model did about it */}
            {result?.is_high_volatility && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--st-amber-fg)"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  <strong style={{ color: "var(--st-amber-fg)" }}>
                    High demand volatility detected -{" "}
                  </strong>
                  Sales follow an irregular spike pattern (variability:{" "}
                  {result.cv?.toFixed(2)}×). SSA captures the long-run{" "}
                  {isMoneySource(submittedConfig.source) ? "revenue" : "demand"} trend
                  {result.trend_avg != null
                    ? ` (~${isMoneySource(submittedConfig.source)
                        ? "\u20b1" + Math.round(result.trend_avg).toLocaleString()
                        : Math.round(result.trend_avg).toLocaleString() + " units"}/${submittedConfig.period.unit.replace(/s$/, "")} baseline)`
                    : ""}
                  . It cannot predict <em>when</em> individual order spikes
                  occur. Use this forecast as a {submittedConfig.period.unit.replace(/s$/, "")}-level{" "}
                  {isMoneySource(submittedConfig.source) ? "revenue" : "quantity"} baseline, not an
                  exact prediction.
                </span>
              </div>
            )}

            {result?.forecast_dampened && (
              <div className="ssa-warning-banner">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--st-amber-fg)"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong style={{ color: "var(--st-amber-fg)" }}>
                    Forecast was dampened -
                  </strong>{" "}
                  The model projected values significantly above your recent
                  sales average, likely due to a past spike being treated as a
                  recurring pattern. The forecast has been scaled down to stay
                  closer to recent actuals.
                </span>
              </div>
            )}
            </div>
            )}

            <div className="ssa-card">
              <div className="ssa-card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
                <div>
                  <h2 className="ssa-card-title">
                    {isInvMode
                      ? `Stock Depletion \u2014 ${selectedItemName}`
                      : parseInt(forecastCount, 10) > 0
                      ? `${submittedConfig.sourceLabel} \u2014 ${submittedConfig.count} ${submittedConfig.period.unit} Forecast`
                      : `${submittedConfig.sourceLabel} \u2014 Historical`}
                  </h2>
                  {isInvMode ? (
                    <div className="ssa-chart-legend">
                      <span className="lg"><span className="swatch" style={{ background: "var(--gray)" }} />Stock Level</span>
                      {parseInt(forecastCount, 10) > 0 && (
                        <span className="lg"><span className="swatch" style={{ background: "var(--gold)" }} />Projected Stock</span>
                      )}
                      <span className="lg"><span className="swatch" style={{ background: "var(--st-green-fg)" }} />Today</span>
                      {invPolicy && invPolicy.ROP > 0 && (
                        <span className="lg"><span className="swatch" style={{ background: "var(--st-amber-fg)" }} />Reorder point</span>
                      )}
                      {stockoutDate && (
                        <span className="lg"><span className="swatch" style={{ background: "var(--st-red-fg)" }} />Stockout</span>
                      )}
                    </div>
                  ) : (
                    <div className="ssa-chart-legend">
                      <span className="lg"><span className="swatch" style={{ background: "var(--gray)" }} />Actual</span>
                      <span className="lg"><span className="swatch" style={{ background: "var(--gold)" }} />Forecast</span>
                      {showConfidence && parseInt(forecastCount, 10) > 0 && (
                        <span className="lg"><span className="swatch" style={{ background: "rgba(212,168,67,0.45)" }} />{"CI \u00b11.96\u03c3"}</span>
                      )}
                    </div>
                  )}
                </div>
                {!isInvMode && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {(todayRefDate || todayPeriodStart) && (
                    <span className="ssa-today-pill">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                      Today
                    </span>
                  )}
                  {!isInvMode && parseInt(forecastCount, 10) > 0 && (
                    <>
                      <button
                        type="button"
                        className={`ssa-toggle-btn ${showConfidence ? "active" : ""}`}
                        aria-pressed={showConfidence}
                        onClick={() => setShowConfidence((v) => !v)}
                      >
                        Confidence
                      </button>
                      <button
                        type="button"
                        className={`ssa-toggle-btn ${showTrend ? "active" : ""}`}
                        aria-pressed={showTrend}
                        onClick={() => setShowTrend((v) => !v)}
                      >
                        Trend
                      </button>
                      <button
                        type="button"
                        className={`ssa-toggle-btn ${showSeasonality ? "active" : ""}`}
                        aria-pressed={showSeasonality}
                        onClick={() => setShowSeasonality((v) => !v)}
                      >
                        Seasonality
                      </button>
                      <span className="ssa-tooltip">
                        <button
                          type="button"
                          className={`ssa-toggle-btn ${showBacktest ? "active" : ""}`}
                        aria-pressed={showBacktest}
                          onClick={() => setShowBacktest((v) => !v)}
                        >
                          Backtest
                        </button>
                        <span className="ssa-tooltip-text">
                          Backtest shows how the model would have performed on
                          past data it never saw. The green line = actual sales
                          during the held-out test window. Comparing it to the
                          forecast line shows how trustworthy the model is.
                        </span>
                      </span>
                    </>
                  )}
                  {!isInvMode && <div className="ssa-filter-divider" />}
                  {!isInvMode && (
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showDecomp ? "active" : ""}`}
                        aria-pressed={showDecomp}
                      onClick={() => setShowDecomp((v) => !v)}
                    >
                      Decomposition
                    </button>
                  )}
                  {!isInvMode && (
                    <button
                      type="button"
                      className={`ssa-toggle-btn ${showAllHistory ? "active" : ""}`}
                        aria-pressed={showAllHistory}
                      onClick={() => setShowAllHistory((v) => !v)}
                      title="Show all historical training data instead of just the recent slice"
                    >
                      All History
                    </button>
                  )}
                </div>
                )}
              </div>

              {/* ── Date picker toolbar ─────────────────────────────── */}
              {!isInvMode && parseInt(forecastCount, 10) > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border)", marginBottom: "12px" }}>
                  <span style={{ fontSize: "11px", color: "var(--gold)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
                    Look up period:
                  </span>
                  <CustomSelect
                    value={pickerDate}
                    placeholder={submittedConfig.period.type === "weekly" ? "Select week…" : submittedConfig.period.type === "monthly" ? "Select month…" : "Select year…"}
                    style={{ minWidth: 130 }}
                    options={fcDatesForPicker.map((d) => ({ value: d, label: formatDateLabel(d, submittedConfig.period.type) }))}
                    onChange={setPickerDate}
                  />
                  {pickerMatchDate && result?.forecast?.values?.[pickerMatchIdx] != null && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                      <span style={{ fontSize: "13px", color: "var(--gray)" }}>
                        {formatDateLabel(pickerMatchDate, submittedConfig.period.type)}:
                      </span>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--gold)" }}>
                        {fmtSourceValue(result.forecast.values[pickerMatchIdx], submittedConfig.source, true)}
                      </span>
                    </div>
                  )}
                  {pickerDate && pickerMatchDate === null && (
                    <span style={{ fontSize: "12px", color: "var(--gray)" }}>Not in forecast range</span>
                  )}
                </div>
              )}

              {showBacktest && backtestData.length > 0 && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--gray)",
                    marginBottom: "12px",
                    lineHeight: 1.5,
                    padding: "8px 12px",
                    background: "rgba(74,222,128,0.06)",
                    border: "1px solid var(--st-green-bg)",
                    borderRadius: "6px",
                  }}
                >
                  <span style={{ color: "var(--st-green-fg)", fontWeight: 600 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "currentColor", marginRight: 6 }} /> Backtest Actual
                  </span>
                  {" - real sales during the held-out test window. "}
                  The closer this is to the Forecast line, the more reliable
                  your model is. Gap between them = MAE / MAPE shown in the
                  stats above.
                </div>
              )}

              <div ref={chartRef} style={{ height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {(() => {
                    const chartData = isInvMode ? getInventoryChartData() : getCombinedChartData();
                    // Dash vocabulary - each pattern carries exactly one meaning:
                    //   "3 3" grid  |  "6 3" projected  |  "4 4" threshold/marker  |  "2 2" backtest.
                    // It was six arbitrary patterns, so dashing signalled nothing.
                    return (
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickMargin={8}
                          minTickGap={35}
                          tickFormatter={chartDateFormatter}
                        />
                        <YAxis
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickFormatter={yAxisFormatter}
                          domain={
                            submittedConfig?.source === "inventory_stock"
                              ? [0, (dataMax) => Math.ceil(dataMax * 1.25) || 10]
                              : ["auto", "auto"]
                          }
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: "13px", minWidth: 160 }}>
                                <div style={{ color: "var(--gray)", marginBottom: "6px", fontSize: "12px" }}>
                                  {chartDateFormatter(label)}
                                </div>
                                {payload.map((p) => {
                                  if (p.value == null) return null;
                                  return (
                                    <div key={p.dataKey} style={{ color: p.color ?? "var(--white)", marginBottom: "2px" }}>
                                      {p.name}: {yAxisFormatter(p.value)}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }}
                        />
                        {!isInvMode && (
                          <Legend
                            wrapperStyle={{
                              paddingTop: "16px",
                              fontSize: "13px",
                            }}
                          />
                        )}
                        {isInvMode ? (
                          <>
                            {showConfidence && (
                              <Area
                                type="monotone"
                                dataKey="Band"
                                name="Likely range"
                                stroke="none"
                                fill="var(--gold)"
                                fillOpacity={0.14}
                                isAnimationActive={false}
                                legendType="rect"
                                connectNulls={false}
                              />
                            )}
                            <Line
                              type="stepAfter"
                              dataKey="StockActual"
                              name="Stock Level"
                              stroke="var(--gray)"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="StockForecast"
                              name="Projected Stock"
                              stroke="var(--gold)"
                              strokeWidth={2.5}
                              strokeDasharray="6 3"
                              dot={false}
                              activeDot={{ r: 5 }}
                            />
                          </>
                        ) : (
                          <>
                            <Line
                              type="monotone"
                              dataKey="Actual"
                              stroke="var(--gray)"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 3 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="Forecast"
                              stroke="var(--gold)"
                              strokeWidth={2.5}
                              strokeDasharray="6 3"
                              dot={false}
                              activeDot={{ r: 5 }}
                            />
                            {showTrend && (
                              <Line
                                type="monotone"
                                dataKey="Trend"
                                stroke="var(--st-blue-fg)"
                                strokeWidth={1.5}
                                dot={false}
                                activeDot={{ r: 3 }}
                              />
                            )}
                            {showSeasonality && (
                              <Line
                                type="monotone"
                                dataKey="Seasonality"
                                stroke="var(--st-purple-fg)"
                                strokeWidth={1.5}
                                dot={false}
                                activeDot={{ r: 3 }}
                              />
                            )}
                            {showBacktest && backtestData.length > 0 && (
                              <Line
                                type="monotone"
                                dataKey="BacktestActual"
                                name="Backtest Actual"
                                stroke="var(--st-green-fg)"
                                strokeWidth={2}
                                strokeDasharray="2 2"
                                dot={false}
                                activeDot={{ r: 3 }}
                                legendType="line"
                              />
                            )}
                          </>
                        )}
                        {chartData.length > 1 && (
                          <Brush
                            key={`brush-${chartData.length}`}
                            dataKey="date"
                            height={24}
                            stroke="var(--border)"
                            fill="var(--dark)"
                            travellerWidth={8}
                            tickFormatter={chartDateFormatter}
                          />
                        )}
                        {!isInvMode && (todayRefDate || todayPeriodStart) && (
                          <ReferenceLine
                            x={todayRefDate || todayPeriodStart}
                            stroke="var(--st-green-fg)"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            label={{ value: `Today · ${todayDisplay}`, position: "insideTopLeft", fill: "var(--st-green-fg)", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && (
                          <ReferenceLine
                            x={todayIso}
                            stroke="var(--st-green-fg)"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            label={{ value: `Today · ${todayDisplay}`, position: "insideTopLeft", fill: "var(--st-green-fg)", fontSize: 10 }}
                          />
                        )}
                        {pickerMatchDate && (
                          <ReferenceLine
                            x={pickerMatchDate}
                            stroke="var(--gold)"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            label={{ value: formatDateLabel(pickerMatchDate, submittedConfig?.period?.type), position: "insideTopRight", fill: "var(--gold)", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && stockoutDate && parseInt(forecastCount, 10) > 0 && (
                          <ReferenceLine
                            x={stockoutDate}
                            stroke="rgba(248,113,113,0.65)"
                            strokeDasharray="4 4"
                            label={{ value: "Stockout", position: "insideBottomRight", fill: "var(--st-red-fg)", fontSize: 10 }}
                          />
                        )}
                        {isInvMode && invPolicy && invPolicy.ROP > 0 && (
                          <ReferenceLine
                            y={invPolicy.ROP}
                            stroke="rgba(251,191,36,0.6)"
                            strokeDasharray="4 4"
                            label={{ value: `Reorder pt (${invPolicy.ROP})`, position: "insideBottomLeft", fill: "var(--st-amber-fg)", fontSize: 10 }}
                          />
                        )}
                      </ComposedChart>
                    );
                  })()}
                </ResponsiveContainer>
              </div>

              {/* \u2500\u2500 Inline SSA Decomposition \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
              {showDecomp && (
                <>
                  <div className="ssa-section-divider" />
                  <div className="ssa-card-header" style={{ margin: "20px 0 16px" }}>
                    <h2 className="ssa-card-title" style={{ fontSize: "14px" }}>SSA Decomposition</h2>
                    <span style={{ fontSize: "12px", color: "var(--gray)" }}>Trend \u00b7 Seasonality \u00b7 Noise</span>
                  </div>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={getDecompChartData()}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="date"
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickMargin={8}
                          minTickGap={35}
                          tickFormatter={(v) => formatDateLabel(v, null, false)}
                        />
                        <YAxis
                          stroke="var(--gray)"
                          tick={{ fill: "var(--gray)", fontSize: 11 }}
                          tickFormatter={yAxisFormatter}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}
                          itemStyle={{ color: "var(--white)" }}
                          labelStyle={{ color: "var(--gray)" }}
                          labelFormatter={(v) => formatDateLabel(v, null, false)}
                        />
                        <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "13px" }} />
                        <Line type="monotone" dataKey="Trend" stroke="var(--gold)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Seasonality" stroke="var(--st-blue-fg)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Noise" stroke="rgba(255,255,255,0.25)" strokeWidth={1} dot={false} activeDot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--gray)", marginTop: "12px", marginBottom: 0, lineHeight: 1.5 }}>
                    Trend: long-run direction. Seasonality: periodic patterns. Noise: residual.
                  </p>
                </>
              )}
            </div>

            {parseInt(forecastCount, 10) > 0 && !isInvMode && (
              <div className="ssa-info-banner">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  SSA decomposed the series into trend, seasonality, and noise. Shaded bands show {"\u00b11.96\u03c3"} confidence interval.
                  {result?.auto_L && (
                    <>
                      {" "}Window <strong style={{ color: "var(--gold)" }}>L={result.auto_L.L_used}</strong> selected automatically
                      {result.auto_L.period_detected
                        ? <> \u00b7 period detected: <strong style={{ color: "var(--white)" }}>{result.auto_L.period_detected} steps</strong>.</>
                        : " (no dominant period detected; fallback heuristic used)."}
                    </>
                  )}
                </span>
              </div>
            )}
            {isInvMode && !(parseInt(forecastCount, 10) > 0) && (
              <p style={{ fontSize: "13px", color: "var(--gray)", marginTop: "12px", marginBottom: "24px", lineHeight: 1.5 }}>
                Showing recorded stock up to today. Enter a{" "}
                <strong style={{ color: "var(--gold)" }}>look-ahead</strong> on the left and run the forecast to project future stock levels and see when{" "}
                {selectedItemName || "this item"} may run out.
              </p>
            )}
            {parseInt(forecastCount, 10) > 0 && isInvMode && (
              <p style={{ fontSize: "12px", color: "var(--gray)", fontStyle: "italic", marginTop: "12px", marginBottom: "24px", lineHeight: 1.5 }}>
                {`This is a demand-based projection: the model estimates ${selectedItemName}'s demand and depletes the current ${currentStockQty?.toLocaleString() ?? "\u2014"} units assuming no restock. The actionable output is the reorder point${invPolicy ? ` (${invPolicy.ROP.toLocaleString()} units)` : ""} and reorder-by date above \u2014 treat the gold line as a central estimate, not an exact path. Gray staircase = recorded stock; yellow line = reorder point.`}
              </p>
            )}
            {isInvMode && invPolicy && invPolicy.d > 0 && invPolicy.d < 0.5 && submittedConfig?.period?.type === "weekly" && (
              <div className="ssa-warning-banner" style={{ background: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.3)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--st-blue-fg)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong style={{ color: "var(--st-blue-fg)" }}>Low weekly demand \u2014</strong>{" "}
                  this item sells under 1 unit/week, so weekly numbers are mostly fractional. Switch to{" "}
                  <strong style={{ color: "var(--white)" }}>Monthly</strong> or <strong style={{ color: "var(--white)" }}>Annually</strong> for clearer whole-unit figures.
                </span>
              </div>
            )}

            {parseInt(forecastCount, 10) > 0 && (
              isInvMode ? (
                <div className="ssa-card">
                  <div className="ssa-card-header">
                    <h2 className="ssa-card-title">Projected Stock Levels</h2>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="ssa-table">
                      <thead>
                        <tr>
                          <th>{submittedConfig.period.tableHeader}</th>
                          <th>Date</th>
                          <th>Projected Stock</th>
                          <th>Est. Demand</th>
                          <th>Cumulative</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const fcDates  = result.forecast?.dates  || [];
                          const fcValues = result.forecast?.values || [];
                          const todayStr = businessToday();
                          const startStock = availableQty ?? 0;   // reserved stock is spoken for
                          const reorderPt = invPolicy?.ROP ?? (inventoryList.find((it) => (it._id ?? it.id) === selectedInventoryId)?.minStockLevel ?? 0);
                          const tblRows = [];
                          let cumDemand = 0;   // float - accumulate sub-unit demand
                          let displayIdx = 0;
                          for (let i = 0; i < fcDates.length; i++) {
                            if (fcDates[i] <= todayStr) continue;
                            const demand = Math.max(0, fcValues[i] ?? 0);
                            cumDemand += demand;
                            const remaining = Math.max(0, startStock - cumDemand);
                            const isOut = remaining < 0.5;
                            const isLow = !isOut && (reorderPt > 0 ? remaining <= reorderPt : (startStock > 0 && remaining <= startStock * 0.2));
                            tblRows.push(
                              <tr key={i} className="ssa-forecast-day-row">
                                <td>{++displayIdx}</td>
                                <td style={{ fontSize: "14px", color: "var(--gray)" }}>
                                  {formatDateLabel(fcDates[i], submittedConfig.period.type)}
                                </td>
                                <td>
                                  <span style={{ color: isOut ? "var(--st-red-fg)" : isLow ? "var(--st-amber-fg)" : "var(--gold)", fontWeight: 600 }}>
                                    {Math.round(remaining).toLocaleString()} units
                                  </span>
                                </td>
                                <td style={{ fontSize: "14px", color: "var(--gray)" }}>
                                  ~{fmtDemand(demand)} units
                                </td>
                                <td style={{ fontSize: "14px", color: "var(--gray)" }}>
                                  {fmtDemand(cumDemand)} units
                                </td>
                                <td>
                                  <span style={{ fontSize: "12px", fontWeight: 600, color: isOut ? "var(--st-red-fg)" : isLow ? "var(--st-amber-fg)" : "var(--st-green-fg)" }}>
                                    {isOut ? "Out of Stock" : isLow ? (reorderPt > 0 ? "Reorder" : "Low Stock") : "In Stock"}
                                  </span>
                                </td>
                              </tr>
                            );
                          }
                          return tblRows;
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <h2 className="ssa-card-title">Forecasted Values</h2>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="ssa-icon-btn" onClick={handleDownloadCSV}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      CSV
                    </button>
                    <button type="button" className="ssa-icon-btn" onClick={handleDownloadPNG}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      PNG
                    </button>
                  </div>
                </div>
                {submittedConfig.source === "sales_qty" && (() => {
                  const vals = result.forecast?.values || [];
                  const dts = result.forecast?.dates || [];
                  if (vals.length === 0) return null;
                  const total = Math.round(vals.reduce((s, v) => s + (v ?? 0), 0));
                  let peak = 0;
                  for (let i = 1; i < vals.length; i++) if ((vals[i] ?? 0) > (vals[peak] ?? 0)) peak = i;
                  return (
                    <div className="ssa-units-summary">
                      <div>
                        <span className="k">Total Projected</span>
                        <span className="v gold">{total.toLocaleString("en-US")} units</span>
                      </div>
                      <div>
                        <span className="k">Peak Demand</span>
                        <span className="v">
                          {formatDateLabel(dts[peak], submittedConfig.period.type)} · {Math.round(vals[peak] ?? 0).toLocaleString("en-US")} units
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ overflowX: "auto" }}>
                  <table className="ssa-table">
                    <thead>
                      <tr>
                        <th>{submittedConfig.period.tableHeader}</th>
                        <th>Date</th>
                        <th>Predicted</th>
                        {submittedConfig.source === "sales_qty" && <th>Cumulative</th>}
                        <th>Upper CI</th>
                        <th>Lower CI</th>
                        <th>Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.forecast?.dates || []).map((date, idx) => {
                        const isPicked = idx === pickerMatchIdx;
                        const _v  = (result.forecast?.values || [])[idx];
                        const _hi = (result.forecast?.confidence_high || [])[idx];
                        const _lo = (result.forecast?.confidence_low  || [])[idx];
                        const _frac = _v != null && _hi != null && _lo != null && _hi > _lo
                          ? Math.min(1, Math.max(0, (_v - _lo) / (_hi - _lo)))
                          : null;
                        const _cum = (result.forecast?.values || [])
                          .slice(0, idx + 1)
                          .reduce((s, v) => s + (v ?? 0), 0);
                        return (
                        <tr
                          key={idx}
                          className="ssa-forecast-day-row"
                          style={isPicked ? { background: "rgba(212,168,67,0.08)", outline: "1px solid rgba(212,168,67,0.3)" } : undefined}
                        >
                          <td>{idx + 1}</td>
                          <td style={{ fontSize: "14px", color: isPicked ? "var(--gold)" : "var(--gray)", fontWeight: isPicked ? 700 : 400 }}>
                            {formatDateLabel(date, submittedConfig.period.type)}
                          </td>
                          <td>
                            <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                              {fmtSourceValue((result.forecast?.values || [])[idx], submittedConfig.source, true)}
                            </span>
                          </td>
                          {submittedConfig.source === "sales_qty" && (
                            <td style={{ fontSize: "14px", color: "var(--gray)" }}>
                              {Math.round(_cum).toLocaleString("en-US")} units
                            </td>
                          )}
                          <td style={{ fontSize: "14px", color: "rgba(212,168,67,0.6)" }}>
                            {fmtSourceValue((result.forecast?.confidence_high || [])[idx], submittedConfig.source)}
                          </td>
                          <td style={{ fontSize: "14px", color: "rgba(212,168,67,0.6)" }}>
                            {fmtSourceValue((result.forecast?.confidence_low || [])[idx], submittedConfig.source)}
                          </td>
                          <td>
                            {_frac != null ? (
                              <div className="ssa-range-track" title="Predicted position within the confidence band">
                                <div className="ssa-range-fill" style={{ width: `${(_frac * 100).toFixed(0)}%` }} />
                              </div>
                            ) : (
                              <span style={{ color: "var(--gray)" }}>\u2014</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              )
            )}
          </>
        )}

          </div>{/* ssa-main */}
        </div>{/* ssa-layout */}

        {/* ── close forecast tab ─────────────────────────────────────────── */}
        </>)}

        {/* ── Customer Segments Tab ─────────────────────────────────────── */}
        {activeTab === "segments" && (
          <div className="ssa-tab-scroll">
            {analyticsLoading ? <AnalyticsSkeleton /> : rfmResult ? (
              <>
                {/* header */}
                <div className="ssa-card" style={{marginBottom:"24px"}}>
                  <div className="ssa-card-header" style={{marginBottom:0}}>
                    <div>
                      <h2 className="ssa-card-title">Customer Groups</h2>
                      <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"4px",lineHeight:1.5}}>
                        Customers are grouped by their buying habits - <strong style={{color:"var(--white)"}}>how recently</strong> they bought,{" "}
                        <strong style={{color:"var(--white)"}}>how often</strong> they buy, and <strong style={{color:"var(--white)"}}>how much</strong> they spend -
                        so you can see who your best customers are and who needs winning back.
                      </p>
                    </div>
                    <button type="button" className="ssa-run-btn" onClick={loadRFM}>Refresh</button>
                  </div>
                </div>

                <div className="ssa-metrics-grid">
                  {[
                    { label: "Total Customers", value: rfmResult.total_customers,
                      sub: "identified buyers only" },
                    { label: "Groups Found",  value: rfmResult.summary?.length ?? 0 },
                    { label: "Largest Group", value: [...(rfmResult.summary ?? [])].sort((a,b) => b.count - a.count)[0]?.segment ?? "-" , valueSize: "14px" },
                    { label: "Avg Spend / Customer", value: (rfmResult.customers?.length ?? 0) > 0
                      ? "₱" + (rfmResult.customers.reduce((s,c) => s + (c.monetary ?? 0), 0) / rfmResult.customers.length).toLocaleString("en-US",{maximumFractionDigits:0})
                      : "-" },
                  ].map(({ label, value, valueSize, sub }) => (
                    <SummaryCard key={label} label={label} value={value} sub={sub} valueSize={valueSize} />
                  ))}
                </div>

                <div className="ssa-card">
                  <div style={{marginBottom:"16px"}}>
                    <h2 className="ssa-card-title">Group Overview</h2>
                    <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"4px"}}>
                      What each customer group means for your business - and what to do about it.
                    </p>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--gray)", margin: "-8px 0 16px" }}>
                    Only sales that carry a customer email can be grouped - a walk-in with no email
                    cannot be told apart from any other, so counter sales are not represented here.
                  </p>
                  <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                    {[...(rfmResult.summary ?? [])].sort((a,b) => b.total_monetary - a.total_monetary).map((seg) => (
                      <div key={seg.segment} style={{
                        padding:"16px 16px",
                        borderRadius:"8px",
                        border:"1px solid var(--border)",
                        background: (RFM_COLORS[seg.segment]?.bg ?? "var(--ssa-tint)"),
                      }}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"16px",flexWrap:"wrap"}}>
                          <div style={{flex:1,minWidth:"200px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                              <span className="ssa-rfm-badge" style={{
                                background: RFM_COLORS[seg.segment]?.bg ?? "var(--border)",
                                color: RFM_COLORS[seg.segment]?.color ?? "var(--gray)",
                                border: `1px solid ${(RFM_COLORS[seg.segment]?.color ?? "#ffffff")}33`,
                              }}>
                                {seg.segment}
                              </span>
                              <span style={{fontSize:"12px",color:"var(--gray)"}}>
                                {seg.count} customer{seg.count !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <p style={{fontSize:"13px",color:"var(--gray)",margin:0,lineHeight:1.55}}>
                              {SEGMENT_DESC[seg.segment] ?? ""}
                            </p>
                          </div>
                          <div style={{display:"flex",gap:"24px",flexShrink:0,flexWrap:"wrap",alignItems:"flex-start"}}>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"11px",color:"var(--gray)",marginBottom:"2px",textTransform:"uppercase",letterSpacing:"0.4px"}}>Last bought</div>
                              <div style={{fontWeight:700,color:"var(--white)",fontSize:"14px"}}>{seg.avg_recency?.toFixed(0)} days ago</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"11px",color:"var(--gray)",marginBottom:"2px",textTransform:"uppercase",letterSpacing:"0.4px"}}>Avg orders</div>
                              <div style={{fontWeight:700,color:"var(--white)",fontSize:"14px"}}>{seg.avg_frequency?.toFixed(1)}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:"11px",color:"var(--gray)",marginBottom:"2px",textTransform:"uppercase",letterSpacing:"0.4px"}}>Total revenue</div>
                              <div style={{fontWeight:700,color:"var(--gold)",fontSize:"14px"}}>₱{seg.total_monetary?.toLocaleString("en-US",{maximumFractionDigits:0})}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ssa-card">
                  <div style={{marginBottom:"16px"}}>
                    <h2 className="ssa-card-title">
                      Customer Detail
                      <span style={{fontSize:"13px",fontWeight:400,color:"var(--gray)",marginLeft:"8px"}}>(top 100 most valuable)</span>
                    </h2>
                    <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"4px"}}>
                      The value score (out of 15) combines how recently, how often, and how much each customer buys. Higher = more valuable.
                    </p>
                  </div>
                  <div className="ssa-tbl-wrap" style={{maxHeight:"420px"}}>
                    <table className="ssa-table">
                      <thead style={{position:"sticky",top:0,background:"var(--dark2)",zIndex:1}}>
                        <tr>
                          <th>Customer</th>
                          <th>Group</th>
                          <th style={{textAlign:"right"}}>Value score <span style={{fontWeight:400,opacity:0.6}}>(max 15)</span></th>
                          <th style={{textAlign:"right"}}>Last bought</th>
                          <th style={{textAlign:"right"}}>Orders</th>
                          <th style={{textAlign:"right"}}>Total spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(rfmResult.customers ?? [])].sort((a,b) => b.rfm_score - a.rfm_score).slice(0,100).map((c, idx) => (
                          <tr key={idx}>
                            <td style={{color:"var(--gray)",fontSize:"13px"}}>{c.email}</td>
                            <td>
                              <span className="ssa-rfm-badge" style={{background: RFM_COLORS[c.segment]?.bg ?? "var(--border)", color: RFM_COLORS[c.segment]?.color ?? "var(--gray)"}}>
                                {c.segment}
                              </span>
                            </td>
                            <td style={{fontWeight:700,color:"var(--gold)",textAlign:"right"}}>{c.rfm_score}</td>
                            <td style={{color:"var(--gray)",textAlign:"right"}}>{c.recency} days ago</td>
                            <td style={{textAlign:"right"}}>{c.frequency}</td>
                            <td style={{textAlign:"right"}}>₱{c.monetary?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <div>
                    <h2 className="ssa-card-title">Customer Groups</h2>
                    <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"6px"}}>Groups customers by how recently, how often, and how much they buy.</p>
                  </div>
                  <button type="button" className="ssa-run-btn" onClick={loadRFM}>Load</button>
                </div>
                {rfmError && <div className="ssa-error" style={{marginTop:"16px"}}>{rfmError}</div>}
              </div>
            )}
          </div>
        )}

        {/* ── Products & Services Tab (ABC Product/Service Segmentation) ── */}
        {activeTab === "products" && (
          <div className="ssa-tab-scroll">
            {analyticsLoading ? <AnalyticsSkeleton /> : serviceResult ? (
              <>
                {/* ── header ── */}
                <div className="ssa-card" style={{marginBottom:"24px"}}>
                  <div className="ssa-card-header" style={{marginBottom:"12px"}}>
                    <div>
                      <h2 className="ssa-card-title">Products &amp; Services</h2>
                      <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"4px",lineHeight:1.55}}>
                        Ranks every product by how much revenue it brings in, and sorts them into three tiers -
                        <strong style={{color:"var(--white)"}}> Best sellers</strong> (top 70% of revenue),{" "}
                        <strong style={{color:"var(--white)"}}>Steady</strong> (next 20%), and{" "}
                        <strong style={{color:"var(--white)"}}>Low performers</strong> (the rest) - alongside how often each sells and its average sale value.
                      </p>
                    </div>
                    <button type="button" className="ssa-run-btn" onClick={loadProducts}>Refresh</button>
                  </div>
                  {/* ABC legend */}
                  <div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
                    {Object.entries(ABC_DESC).map(([cls, info]) => (
                      <div key={cls} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 12px",borderRadius:"8px",background:"var(--dark)",border:"1px solid var(--border)"}}>
                        <span className="ssa-rfm-badge" style={{
                          background: cls === "A" ? "var(--st-green-bg)" : cls === "B" ? "var(--st-amber-bg)" : "var(--st-red-bg)",
                          color:      cls === "A" ? "var(--st-green-fg)"               : cls === "B" ? "var(--st-amber-fg)"               : "var(--st-red-fg)",
                        }}>{cls}</span>
                        <span style={{fontSize:"13px"}}>
                          <span style={{color:"var(--white)",fontWeight:600}}>{info.label}</span>
                          <span style={{color:"var(--gray)",display:"block",fontSize:"12px"}}>{info.tip}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── summary metrics ── */}
                <div className="ssa-metrics-grid">
                  {[
                    { label: "Total Products",    value: serviceResult?.total_services ?? "-",   sub: "distinct products / services" },
                    { label: "Total Revenue",      value: serviceResult ? "₱" + (serviceResult.total_revenue ?? 0).toLocaleString("en-US",{maximumFractionDigits:0}) : "-", sub: "from all recorded sales" },
                    { label: "Best Sellers",       value: (serviceResult?.services ?? []).filter(s => s.abc_class === "A").length || "-", sub: "top 70% of revenue" },
                    { label: "Top Earner",         value: serviceResult?.top_services?.[0]?.service ?? "-",                        sub: "highest revenue product" , valueSize: "14px" },
                  ].map(({ label, value, sub, valueSize }) => (
                    <SummaryCard key={label} label={label} value={value} sub={sub} valueSize={valueSize} />
                  ))}
                </div>

                {/* ── unified product table ── */}
                {serviceResult && (
                  <div className="ssa-card">
                    <div style={{marginBottom:"16px"}}>
                      <h2 className="ssa-card-title">Product Performance</h2>
                      <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"4px"}}>
                        Sorted by revenue. &ldquo;Times sold&rdquo; is how many recorded sales included this product.
                      </p>
                    </div>
                    <div className="ssa-tbl-wrap" style={{maxHeight:"500px"}}>
                      <table className="ssa-table">
                        <thead style={{position:"sticky",top:0,background:"var(--dark2)",zIndex:1}}>
                          <tr>
                            <th>Product / Service</th>
                            <th>Tier</th>
                            <th style={{textAlign:"right"}}>Revenue</th>
                            <th style={{textAlign:"right"}}>Revenue share</th>
                            <th style={{textAlign:"right"}}>Times sold</th>
                            <th style={{textAlign:"right"}}>Avg / sale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(serviceResult.services ?? []).map((svc, idx) => {
                            return (
                              <tr key={idx}>
                                <td style={{fontWeight:600}}>{svc.service}</td>
                                <td>
                                  <span className="ssa-rfm-badge" style={{
                                    background: svc.abc_class === "A" ? "var(--st-green-bg)" : svc.abc_class === "B" ? "var(--st-amber-bg)" : "var(--st-red-bg)",
                                    color:      svc.abc_class === "A" ? "var(--st-green-fg)"               : svc.abc_class === "B" ? "var(--st-amber-fg)"               : "var(--st-red-fg)",
                                  }}>
                                    {svc.abc_class} - {ABC_DESC[svc.abc_class]?.label.split("-")[0].trim()}
                                  </span>
                                </td>
                                <td style={{color:"var(--gold)",fontWeight:600,textAlign:"right"}}>₱{svc.total_revenue?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                                <td style={{textAlign:"right"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:"8px",justifyContent:"flex-end"}}>
                                    <span style={{color:"var(--gray)"}}>{((svc.revenue_share ?? 0) * 100).toFixed(1)}%</span>
                                    <div style={{width:"50px",height:"5px",borderRadius:"999px",background:"var(--border)",overflow:"hidden",flexShrink:0}}>
                                      <div style={{height:"100%",width:`${((svc.revenue_share ?? 0) * 100).toFixed(1)}%`,borderRadius:"999px",background: svc.abc_class === "A" ? "var(--st-green-fg)" : svc.abc_class === "B" ? "var(--st-amber-fg)" : "var(--st-red-fg)"}} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{textAlign:"right",fontWeight:600}}>{svc.order_count}</td>
                                <td style={{textAlign:"right"}}>₱{svc.avg_price?.toLocaleString("en-US",{maximumFractionDigits:0})}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </>
            ) : (
              <div className="ssa-card">
                <div className="ssa-card-header">
                  <div>
                    <h2 className="ssa-card-title">Products &amp; Services</h2>
                    <p style={{fontSize:"13px",color:"var(--gray)",marginTop:"6px"}}>
                      Ranks products by revenue and shows how often each one sells.
                    </p>
                  </div>
                  <button type="button" className="ssa-run-btn" onClick={loadProducts}>Load</button>
                </div>
                {serviceError && (
                  <div className="ssa-error" style={{marginTop:"16px"}}>{serviceError}</div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
