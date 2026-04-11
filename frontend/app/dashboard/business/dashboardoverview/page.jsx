"use client";

/**
 * DASHBOARD OVERVIEW PAGE
 *
 * SSA-Style Business Dashboard for Personalize Me Prints
 * Located at: /dashboard/business/dashboardoverview
 */

import { useCallback, useEffect, useState } from "react";
import DashboardOverview from "./DashboardOverview";

// ── Storage Keys ───────────────────────────────────────────────────────────────
const MATERIALS_KEY = "pmp_materials";
const STOCK_OUT_KEY = "pmp_stock_out_log";

// ── Storage Helper ─────────────────────────────────────────────────────────────
function getStore(key) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export default function DashboardOverviewPage() {
  const [materials, setMaterials] = useState([]);
  const [stockOuts, setStockOuts] = useState([]);

  const refresh = useCallback(() => {
    setMaterials(getStore(MATERIALS_KEY));
    setStockOuts(getStore(STOCK_OUT_KEY));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="page-content-wrapper">
      <DashboardOverview materials={materials} stockOuts={stockOuts} />
    </div>
  );
}
