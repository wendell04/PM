"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * The SSA forecast chart - Revenue / Quantity / Inventory - exactly as the old Dashboard draws it.
 *
 * It lived inline in DashboardOverview, so putting "the same chart" on the new Home meant either
 * copying it or drawing a different one; the first try drew a different one and the owner asked,
 * rightly, why it did not match. One component now, used by both pages, so they cannot drift.
 *
 * Takes the two SSA responses (revenue and quantity, daily rows from Sales, weekly forecast) and the
 * last 30 days of revenue for the fallback sparkline when SSA has nothing to say.
 */
const HIST_WINDOW = 20; // show only last N historical weeks

function buildMiniSsaChartData(ssaResult) {
  if (!ssaResult) return [];
  const allHistDates  = ssaResult.historical?.dates  || [];
  const allHistValues = ssaResult.historical?.values || [];
  const fcDates       = ssaResult.forecast?.dates    || [];
  const fcValues      = ssaResult.forecast?.values   || [];
  const fcHigh        = ssaResult.forecast?.confidence_high || [];
  const fcLow         = ssaResult.forecast?.confidence_low  || [];

  // Trim history to last HIST_WINDOW points so the chart isn't compressed
  const start      = Math.max(0, allHistDates.length - HIST_WINDOW);
  const histDates  = allHistDates.slice(start);
  const histValues = allHistValues.slice(start);

  const _t            = new Date();
  const todayStr      = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;
  const lastHistDate  = histDates[histDates.length - 1] ?? null;
  const lastHistValue = histValues[histValues.length - 1] ?? null;

  const data = histDates.map((date, i) => ({ date, Actual: histValues[i] ?? null }));

  // Bridge: extend Actual from last historical date up to today so the
  // "Forecast Start" line always aligns with today, not with the last training week.
  if (lastHistDate && lastHistDate < todayStr) {
    const cur = new Date(lastHistDate + "T00:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + 1);
    const end = new Date(todayStr + "T00:00:00Z");
    while (cur <= end) {
      data.push({ date: cur.toISOString().split("T")[0], Actual: lastHistValue });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Only draw forecast for dates strictly after today
  fcDates.forEach((date, i) => {
    if (date <= todayStr) return;
    data.push({
      date,
      Forecast: fcValues[i] ?? null,
      High:     fcHigh[i] ?? null,
      Low:      fcLow[i] ?? null,
    });
  });

  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}

export default function SsaMiniChart({ ssaRevResult = null, ssaQtyResult = null, dailyRevenue = [] }) {
  const router = useRouter();
  const [miniSource, setMiniSource] = useState("revenue");

    const isInventory = miniSource === "inventory";
    const ssaResult   = miniSource === "quantity" ? ssaQtyResult : ssaRevResult;
    const miniData    = buildMiniSsaChartData(isInventory ? null : ssaResult);
    const _now        = new Date();
    const todayStr    = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    const isRevenue   = miniSource === "revenue";

    const fmtVal = (v) => {
      if (v == null) return "-";
      if (isRevenue) {
        if (Math.abs(v) >= 1000000) return "₱" + (v / 1000000).toFixed(1) + "M";
        if (Math.abs(v) >= 1000) return "₱" + (v / 1000).toFixed(1) + "K";
        return "₱" + v.toFixed(0);
      }
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "K";
      return Math.round(v).toString();
    };
    const fmtDate = (ds) => {
      if (!ds) return "";
      const d = new Date(ds + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    };

    const sourceLabel = isRevenue ? "REVENUE" : miniSource === "quantity" ? "QUANTITY" : "INVENTORY STOCK";

    return (
      <div style={{ marginTop: "1rem" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
          {/* Source toggle buttons */}
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {[
              { key: "revenue",   label: "Revenue" },
              { key: "quantity",  label: "Quantity" },
              { key: "inventory", label: "Inventory" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMiniSource(key)}
                className="home-range-btn"
                style={{
                  padding: "0.2rem 0.55rem",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: miniSource === key ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.12)",
                  background: miniSource === key ? "rgba(212,168,67,0.15)" : "rgba(255,255,255,0.04)",
                  color: miniSource === key ? "var(--gold)" : "var(--gray)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span
            style={{ fontSize: "0.65rem", color: "var(--gold)", fontWeight: 600, cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/ssa-forecast")}
          >
            View Full Forecast →
          </span>
        </div>

        <div style={{ fontSize: "0.65rem", color: "var(--gray)", fontWeight: 600, marginBottom: "0.4rem", letterSpacing: "0.05em" }}>
          SSA {sourceLabel} FORECAST (WEEKLY)
        </div>

        {/* Inventory: redirect card */}
        {isInventory ? (
          <div
            style={{ height: "180px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.1)", cursor: "pointer" }}
            onClick={() => router.push("/dashboard/business/ssa-forecast")}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><path d="M3 3h18v18H3z" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--white)" }}>Select an item in the Forecast tab</div>
              <div style={{ fontSize: "0.68rem", color: "var(--gold)", marginTop: "0.25rem" }}>Open SSA Forecast →</div>
            </div>
          </div>
        ) : miniData.length === 0 ? (
          /* Fallback sparkline when SSA has no data */
          <div style={{ height: "180px", borderRadius: "8px", overflow: "hidden" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--gold)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem 0.65rem", fontSize: "0.72rem" }}>
                        <div style={{ color: "var(--gray)" }}>{label}</div>
                        <div style={{ color: "var(--gold)", fontWeight: 700 }}>₱{(payload[0].value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2} fill="url(#revGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: "180px", borderRadius: "8px", overflow: "hidden" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={miniData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--gray)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "var(--gray)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtVal} width={44} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem 0.65rem", fontSize: "0.72rem" }}>
                        <div style={{ color: "var(--gray)", marginBottom: "0.2rem" }}>{fmtDate(label)}</div>
                        {payload.map((p) => p.value != null && (
                          <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 700 }}>
                            {p.name}: {fmtVal(p.value)}
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={todayStr} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="Actual" name="Actual" stroke="var(--gray)" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="Forecast" name="Forecast" stroke="var(--gold)" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="High" name="Upper CI" stroke="rgba(212,168,67,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls={false} legendType="none" />
                <Line type="monotone" dataKey="Low" name="Lower CI" stroke="rgba(212,168,67,0.35)" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls={false} legendType="none" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
}
