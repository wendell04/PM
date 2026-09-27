"""
Isolated forecasting benchmark service (port 8002).

Runs SSA against five comparators — Seasonal-Naive, AutoETS, AutoARIMA, Prophet,
Croston/SBA — over an identical rolling-origin backtest, and scores every model
on the same splits with MASE (headline), plus RMSE / MAE / sMAPE. Stateless: the
caller (an isolated dashboard page) fetches data from the Laravel API and POSTs
the rows here. Nothing in ssa-service / backend / frontend is touched.
"""
import warnings, logging
warnings.filterwarnings("ignore")
logging.disable(logging.WARNING)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
from collections import defaultdict
import numpy as np
import pandas as pd
import requests
import os

import pmdarima as pm          # independent auto-ARIMA (its own library)

app = FastAPI(title="Forecast Benchmark", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ── request / row models ──────────────────────────────────────────────────────
class Row(BaseModel):
    date: str
    value: float

class BenchmarkRequest(BaseModel):
    rows: List[Row]
    forecast_type: str = "weekly"          # weekly | monthly | annually
    forecast_periods: int = 4              # horizon h
    data_type: str = "sales"               # sales | stock (kept for parity)

# ── period config ─────────────────────────────────────────────────────────────
FREQ = {"weekly": "W-MON", "monthly": "MS", "annually": "YS"}
SEASON = {"weekly": 52, "monthly": 12, "annually": 1}

def _period_key(dt: pd.Timestamp, ftype: str) -> pd.Timestamp:
    if ftype == "weekly":
        return dt - pd.Timedelta(days=dt.dayofweek)     # Monday of the week
    if ftype == "monthly":
        return dt.replace(day=1)
    return dt.replace(month=1, day=1)

def aggregate(rows: List[Row], ftype: str):
    """Bucket raw rows into a continuous, zero-filled period series."""
    if not rows:
        return [], np.array([])
    df = pd.DataFrame([{"date": pd.to_datetime(r.date), "value": r.value} for r in rows])
    df = df.dropna(subset=["date"])
    df["period"] = df["date"].apply(lambda d: _period_key(d, ftype))
    grp = df.groupby("period")["value"].sum().sort_index()
    full = pd.date_range(grp.index.min(), grp.index.max(), freq=FREQ[ftype])
    grp = grp.reindex(full, fill_value=0.0)
    dates = [d.strftime("%Y-%m-%d") for d in grp.index]
    return dates, grp.values.astype(float)

# ── metrics ───────────────────────────────────────────────────────────────────
def mase_scale(train: np.ndarray, m: int) -> float:
    """In-sample MAE of the (seasonal) naive method — the MASE denominator."""
    if len(train) <= m:
        m = 1
    if len(train) <= m:
        return 1.0
    diffs = np.abs(train[m:] - train[:-m])
    scale = float(np.mean(diffs)) if len(diffs) else 0.0
    if scale == 0.0:                       # flat/degenerate series
        scale = float(np.mean(np.abs(train))) or 1.0
    return scale

def score(actual: np.ndarray, pred: np.ndarray, scale: float) -> dict:
    actual, pred = np.asarray(actual, float), np.asarray(pred, float)
    err = pred - actual
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    denom = np.abs(actual) + np.abs(pred)
    smape = float(np.mean(np.where(denom == 0, 0.0, 2 * np.abs(err) / denom)) * 100)
    mase = mae / scale if scale else float("nan")
    return {"mae": round(mae, 4), "rmse": round(rmse, 4),
            "smape": round(smape, 2), "mase": round(mase, 4)}

# ── ARIMA — pmdarima's standalone auto_arima (its own independent library) ─────
def arima_forecast(train: np.ndarray, h: int, season: int) -> np.ndarray:
    # High-frequency seasonality (m=52 weekly) is impractical for ARIMA, so seasonal
    # order is only used for small periods (e.g. monthly m=12); weekly runs non-seasonal.
    m = season if 1 < season <= 12 else 1
    try:
        model = pm.auto_arima(
            train.astype(np.float64), seasonal=(m > 1), m=m,
            max_p=3, max_q=3, max_P=1, max_Q=1, d=None, D=None,
            stepwise=True, suppress_warnings=True, error_action="ignore",
        )
        fc = model.predict(n_periods=h)
        return np.clip(np.asarray(fc, float), 0.0, None)
    except Exception:
        return np.full(h, np.nan)


# ── Prophet — Facebook's own library (independent) ─────────────────────────────
from prophet import Prophet

def prophet_forecast(train_dates: List[str], train_vals: np.ndarray, h: int, ftype: str) -> np.ndarray:
    try:
        dfp = pd.DataFrame({"ds": pd.to_datetime(train_dates), "y": train_vals})
        m = Prophet(weekly_seasonality=False, daily_seasonality=False,
                    yearly_seasonality=(ftype != "annually"))
        m.fit(dfp)
        fut = m.make_future_dataframe(periods=h, freq=FREQ[ftype], include_history=False)
        pred = m.predict(fut)["yhat"].values
        return np.clip(np.asarray(pred, float), 0.0, None)
    except Exception:
        return np.full(h, np.nan)


# The benchmark calls the RUNNING ssa-service rather than reimplementing SSA
# here. A second copy of the algorithm would drift from the one the product
# actually uses, and then the comparison would measure the copy, not the system.
SSA_URL = os.getenv("SSA_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")

def ssa_forecast(train_dates, train_vals: np.ndarray, h: int, ftype: str,
                 data_type: str = "sales", target_dates=None) -> np.ndarray:
    """Forecast h periods from ssa-service, anchored at the END OF THE TRAINING
    SLICE rather than at today.

    ssa-service sets fc_start = max(next period after the data, this period), so
    a live dashboard never forecasts weeks that have already happened. That is
    right in production and fatal in a backtest: asked to forecast from a train
    slice ending 2026-08-17 it answered for 2026-09-21 onward, five weeks past
    the periods being scored. The first attempt at this comparison was therefore
    measuring SSA's September numbers against August actuals.

    There is no flag to turn that off, so the training dates are moved forward by
    a WHOLE NUMBER OF SEASONAL CYCLES - 52 weeks or 12 months - until the slice
    ends at or after today. A whole cycle leaves every point on the same week of
    the year, so seasonality keeps its phase, while fc_start falls back to the
    natural next period and the h values line up 1:1 with the h test periods.
    """
    try:
        idx = pd.to_datetime(list(train_dates))
        if len(idx) == 0:
            return np.full(h, np.nan)
        freq, cycle = {"weekly": ("W-MON", pd.Timedelta(weeks=52)),
                       "monthly": ("MS", pd.DateOffset(months=12)),
                       "annually": ("YS", pd.DateOffset(years=1))}.get(ftype, ("W-MON", pd.Timedelta(weeks=52)))
        now = pd.Timestamp.now().normalize()
        shifted = idx
        for _ in range(40):                      # bounded; each step is one cycle
            if shifted[-1] >= now:
                break
            shifted = shifted + cycle
        rows = [{"date": d.strftime("%Y-%m-%d"), "value": float(v)}
                for d, v in zip(shifted, np.asarray(train_vals, float))]
        r = requests.post(f"{SSA_URL}/api/forecast", timeout=90, json={
            "rows": rows,
            "forecast_periods": int(h),
            "forecast_type": ftype,
            "data_type": data_type,
        })
        if r.status_code != 200:
            return np.full(h, np.nan)
        vals = (r.json().get("forecast") or {}).get("values") or []
        out = np.asarray(vals, float)[:h]
        if out.size < h:
            out = np.concatenate([out, np.full(h - out.size, np.nan)])
        return np.clip(out, 0.0, None)
    except Exception:
        return np.full(h, np.nan)


MODELS = ["SSA", "ARIMA", "Prophet"]

def all_forecasts(train_dates, train, h, season, ftype, data_type="sales", target_dates=None) -> dict:
    return {
        "SSA": ssa_forecast(train_dates, train, h, ftype, data_type, target_dates),
        "ARIMA": arima_forecast(train, h, season),
        "Prophet": prophet_forecast(train_dates, train, h, ftype),
    }

# ── rolling-origin backtest ────────────────────────────────────────────────────
def future_dates(last: str, h: int, ftype: str) -> List[str]:
    idx = pd.date_range(pd.to_datetime(last), periods=h + 1, freq=FREQ[ftype])[1:]
    return [d.strftime("%Y-%m-%d") for d in idx]

def _data_type_for(series: str) -> str:
    """Match what the dashboard sends: inventory is sparse demand, not a level."""
    return "demand" if series == "inventory" else "sales"

def run_benchmark(rows, forecast_type, forecast_periods, data_type="sales"):
    ftype = forecast_type if forecast_type in FREQ else "weekly"
    dates, y = aggregate(rows, ftype)
    n = len(y)
    if n < 12:
        raise HTTPException(400, f"Not enough history ({n} {ftype} periods). Need at least 12 for a benchmark.")

    h = max(1, min(forecast_periods, 12))
    season_full = SEASON[ftype]
    # Seasonality is only estimable with at least two full cycles; otherwise fall
    # back to non-seasonal models (SeasonalNaive then degenerates to Naive).
    season = season_full if n >= 2 * season_full else 1
    m_mase = season

    # Non-overlapping rolling windows over the tail, keeping a reasonable train size.
    min_train = max(2 * season, 10)
    windows = []
    k = 1
    while True:
        train_end = n - k * h
        if train_end < min_train or len(windows) >= 5:
            break
        windows.append(train_end)
        k += 1
    windows = sorted(windows)
    if not windows:                        # short series → single holdout
        windows = [max(min_train, n - h)]

    scale = mase_scale(y[: windows[0]], m_mase)   # scale from the earliest train slice

    collected = {mdl: {"actual": [], "pred": []} for mdl in MODELS}
    for train_end in windows:
        train = y[:train_end]
        test = y[train_end: train_end + h]
        if len(test) == 0:
            continue
        fc = all_forecasts(dates[:train_end], train, len(test), season, ftype, data_type,
                           dates[train_end: train_end + len(test)])
        for mdl in MODELS:
            p = fc.get(mdl, np.full(len(test), np.nan))[: len(test)]
            if np.all(np.isfinite(p)):
                collected[mdl]["actual"].extend(test.tolist())
                collected[mdl]["pred"].extend(p.tolist())

    # score each model across all pooled window residuals
    model_rows = []
    for mdl in MODELS:
        a, p = np.array(collected[mdl]["actual"]), np.array(collected[mdl]["pred"])
        metrics = score(a, p, scale) if len(a) else {"mae": None, "rmse": None, "smape": None, "mase": None}
        model_rows.append({"model": mdl, **metrics,
                           "n_test": int(len(a)), "failed": len(a) == 0})

    # future forecast on the full series for the overlay chart
    fut_dates = future_dates(dates[-1], h, ftype)
    full_fc = all_forecasts(dates, y, h, season, ftype, data_type, fut_dates)
    for row in model_rows:
        arr = full_fc.get(row["model"])
        row["forecast"] = [None if (arr is None or not np.isfinite(arr[i])) else round(float(arr[i]), 2)
                           for i in range(h)] if arr is not None else [None] * h

    ranked = sorted([r for r in model_rows if r["mase"] is not None], key=lambda r: r["mase"])
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    winner = ranked[0]["model"] if ranked else None

    return {
        "series": {"dates": dates, "values": [round(float(v), 2) for v in y]},
        "forecast_dates": fut_dates,
        "horizon": h,
        "period_type": ftype,
        "backtest": {"windows": len(windows), "test_points_per_model": len(collected[MODELS[0]]["actual"]),
                     "season_length": season, "mase_scale": round(scale, 4)},
        "models": model_rows,
        "ranking": [r["model"] for r in ranked],
        "winner": winner,
        "metric_note": "MASE is the headline (scale-free, scored vs naive). Lower is better; <1 beats the naive baseline.",
    }

@app.post("/api/benchmark")
async def benchmark(req: BenchmarkRequest):
    """Row-based entry point (data POSTed directly)."""
    return run_benchmark(req.rows, req.forecast_type, req.forecast_periods,
                         "demand" if req.data_type == "stock" else "sales")


# ── server-side data fetch from the Laravel API (no browser, no CORS) ──────────
def _laravel_get(api_url: str, path: str, token: str):
    r = requests.get(
        f"{api_url.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=40,
    )
    r.raise_for_status()
    d = r.json()
    return d.get("data", d) if isinstance(d, dict) else d


def _agg_date(sale_date):
    try:
        return pd.to_datetime(sale_date).strftime("%Y-%m-%d")
    except Exception:
        return None


def build_rows(sales, series, inventory_id=None, item_name=None) -> List[Row]:
    """Port of the dashboard's aggregation: sales -> revenue / qty / item-demand rows."""
    if series == "inventory":
        agg = defaultdict(float)
        for s in sales:
            same = (str(s.get("inventoryId") or "") == str(inventory_id or "")
                    or (item_name and s.get("productName") == item_name))
            if not same:
                continue
            ds = _agg_date(s.get("saleDate"))
            if ds:
                agg[ds] += float(s.get("quantity") or 0)
        return [Row(date=d, value=agg[d]) for d in sorted(agg)]

    agg = defaultdict(lambda: {"revenue": 0.0, "qty": 0.0})
    for s in sales:
        ds = _agg_date(s.get("saleDate"))
        if not ds:
            continue
        agg[ds]["revenue"] += float(s.get("totalPrice") or 0)
        agg[ds]["qty"] += float(s.get("quantity") or 0)
    key = "revenue" if series == "sales_revenue" else "qty"
    return [Row(date=d, value=agg[d][key]) for d in sorted(agg)]


class ConnRequest(BaseModel):
    api_url: str
    token: str

class LiveRequest(ConnRequest):
    series: str = "sales_revenue"          # sales_revenue | sales_qty | inventory
    inventory_id: Optional[str] = None
    forecast_type: str = "weekly"
    forecast_periods: int = 4


@app.post("/api/inventory-list")
async def inventory_list(req: ConnRequest):
    try:
        inv = _laravel_get(req.api_url, "/api/admin/inventory", req.token)
    except Exception as e:
        raise HTTPException(502, f"Could not reach the Laravel API: {e}")
    items = [{"id": str(i.get("_id") or i.get("id")), "name": i.get("name")}
             for i in inv if not i.get("hasVariants") and not i.get("isOnDemand")]
    return {"items": items}


@app.post("/api/benchmark-live")
async def benchmark_live(req: LiveRequest):
    try:
        sales = _laravel_get(req.api_url, "/api/admin/sales?limit=10000&status=completed", req.token)
    except Exception as e:
        raise HTTPException(502, f"Could not fetch sales from the Laravel API: {e}")

    item_name = None
    if req.series == "inventory" and req.inventory_id:
        try:
            inv = _laravel_get(req.api_url, "/api/admin/inventory", req.token)
            match = next((i for i in inv if str(i.get("_id") or i.get("id")) == str(req.inventory_id)), None)
            item_name = match.get("name") if match else None
        except Exception:
            pass

    rows = build_rows(sales, req.series, req.inventory_id, item_name)
    result = run_benchmark(rows, req.forecast_type, req.forecast_periods,
                           _data_type_for(req.series))
    result["raw_points"] = len(rows)
    return result


# ── Direct MongoDB read (token-free) ───────────────────────────────────────────
# Reads the same data the API would, straight from Mongo, read-only. No token, no
# backend needed. Connection comes from backend/.env (MONGODB_DSN + DB_DATABASE);
# the DSN is never hardcoded here. Applies the SAME filter the API does: completed.
from pathlib import Path as _Path
from dotenv import dotenv_values as _dotenv_values
from pymongo import MongoClient as _MongoClient

def _mongo_db():
    env = _dotenv_values(_Path(__file__).resolve().parent.parent / "backend" / ".env")
    dsn, dbn = env.get("MONGODB_DSN"), env.get("DB_DATABASE")
    if not dsn or not dbn:
        raise HTTPException(500, "MongoDB config (MONGODB_DSN / DB_DATABASE) not found in backend/.env")
    return _MongoClient(dsn, serverSelectionTimeoutMS=5000)[dbn]

class DbRequest(BaseModel):
    series: str = "sales_revenue"          # sales_revenue | sales_qty | inventory
    inventory_id: Optional[str] = None
    forecast_type: str = "weekly"
    forecast_periods: int = 4

# NOTE: the collection is "inventories", not "inventory". laravel-mongodb 5
# ignores a model's $collection property and uses the pluralised table name, so
# "inventory" and "stock_history" are empty leftovers from before that change -
# reading them returns nothing at all. Real counts: inventories 50, inventory 0.
@app.get("/api/inventory-list-db")
async def inventory_list_db():
    try:
        inv = list(_mongo_db()["inventories"].find({}, {"name": 1, "hasVariants": 1, "isOnDemand": 1}))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Could not read inventory from MongoDB: {e}")
    items = [{"id": str(i.get("_id")), "name": i.get("name")}
             for i in inv if not i.get("hasVariants") and not i.get("isOnDemand")]
    return {"items": items}

def ledger_demand_rows(db, inventory_id: str) -> List[Row]:
    """Material demand from the stock ledger, not from sales.

    Sales never carry a material id - a mug sale consumes "Ceramic White Mug
    11oz" through the bill of materials - so matching sales on inventoryId
    returned nothing for every material. Demand lives in stock_histories.

    The consumption rule mirrors MaterialDemand::countsAsConsumption in the
    backend: 'production' always counts, 'sale_reserved' counts unless its order
    was cancelled or returned. Reservations, releases, restocks and scrap are
    not demand. The status match is case-insensitive here because the data holds
    both 'cancelled' and 'Cancelled'.
    """
    status = {str(o["_id"]): (o.get("orderStatus") or "").strip().lower()
              for o in db["orders"].find({}, {"orderStatus": 1})}
    agg = defaultdict(float)
    for h in db["stock_histories"].find(
            {"inventoryId": inventory_id},
            {"reason": 1, "quantity": 1, "orderId": 1, "saleDate": 1, "createdAt": 1, "_id": 0}):
        reason = h.get("reason")
        if reason == "sale_reserved":
            if status.get(str(h.get("orderId") or ""), "") in ("cancelled", "returned"):
                continue
        elif reason != "production":
            continue
        ds = _agg_date(h.get("saleDate") or h.get("createdAt"))
        if ds:
            agg[ds] += abs(float(h.get("quantity") or 0))
    return [Row(date=d, value=agg[d]) for d in sorted(agg)]


@app.post("/api/benchmark-db")
async def benchmark_db(req: DbRequest):
    try:
        db = _mongo_db()
        sales = list(db["sales"].find(
            {"status": "completed"},
            {"saleDate": 1, "totalPrice": 1, "quantity": 1, "inventoryId": 1, "productName": 1, "_id": 0},
        ))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Could not read sales from MongoDB: {e}")

    item_name = None
    if req.series == "inventory" and req.inventory_id:
        try:
            from bson import ObjectId
            match = db["inventories"].find_one({"_id": ObjectId(req.inventory_id)}, {"name": 1})
            item_name = match.get("name") if match else None
        except Exception:
            item_name = None

    if req.series == "inventory" and req.inventory_id:
        rows = ledger_demand_rows(db, req.inventory_id)
    else:
        rows = build_rows(sales, req.series, req.inventory_id, item_name)
    result = run_benchmark(rows, req.forecast_type, req.forecast_periods,
                           _data_type_for(req.series))
    result["raw_points"] = len(rows)
    result["data_source"] = "mongodb (read-only)"
    return result


@app.get("/", response_class=HTMLResponse)
async def index():
    return INDEX_HTML


@app.get("/health")
async def health():
    return {"status": "ok", "models": MODELS}


INDEX_HTML = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARIMA &amp; Prophet Benchmark</title>
<style>
  :root{--bg:#0f1216;--panel:#171b21;--panel2:#1e232b;--bd:#2a2f37;--tx:#e6e9ee;--mut:#8b93a1;--gold:#d4a843;--green:#4ade80}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
  h1{font-size:1.45rem;margin:0 0 4px;letter-spacing:-.02em}
  .sub{color:var(--mut);font-size:.85rem;margin:0 0 22px;max-width:80ch}
  .panel{background:var(--panel);border:1px solid var(--bd);border-radius:10px;padding:18px;margin-bottom:18px}
  .row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
  .fld{display:flex;flex-direction:column;gap:5px}
  label{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
  input,select{padding:8px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:.85rem;outline:none}
  input:focus,select:focus{border-color:var(--gold)}
  .seg{display:inline-flex;border:1px solid var(--bd);border-radius:6px;overflow:hidden}
  .seg button{padding:8px 12px;background:var(--bg);color:var(--mut);border:0;border-right:1px solid var(--bd);font-size:.82rem;font-weight:600;cursor:pointer}
  .seg button:last-child{border-right:0}
  .seg button.on{background:var(--gold);color:#181818}
  .run{padding:9px 20px;background:var(--gold);color:#181818;border:0;border-radius:6px;font-weight:700;font-size:.88rem;cursor:pointer}
  .run:disabled{opacity:.55;cursor:not-allowed}
  .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:#f87171;border-radius:8px;padding:12px 14px;font-size:.85rem;margin-bottom:18px;white-space:pre-wrap}
  .verdict{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:rgba(212,168,67,.08);border:1px solid rgba(212,168,67,.3);border-radius:10px;padding:14px 18px;margin-bottom:18px}
  .badge{font-size:1.5rem;font-weight:800;color:var(--gold)}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{ text-align:right;padding:9px 10px;border-bottom:1px solid var(--bd);color:var(--mut);font-size:.66rem;text-transform:uppercase;letter-spacing:.05em}
  th:first-child,th:nth-child(2){text-align:left}
  td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right}
  td:first-child,td:nth-child(2){text-align:left}
  tr.win td{background:rgba(74,222,128,.08)}
  .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;vertical-align:middle}
  .pill{display:inline-block;min-width:20px;text-align:center;padding:1px 7px;border-radius:999px;font-weight:700;font-size:.75rem}
  .note{font-size:.74rem;color:var(--mut);margin-top:10px}
  .lgd{display:flex;flex-wrap:wrap;gap:14px;font-size:.72rem;color:var(--mut);margin-top:8px}
  .lgd span{display:inline-flex;align-items:center;gap:6px}
  .muted{color:var(--mut);font-size:.85rem}
</style></head>
<body><div class="wrap">
  <h1>ARIMA &amp; Prophet Benchmark</h1>
  <p class="sub">A rolling-origin backtest of <b>SSA</b> (this system), <b>ARIMA</b> (pmdarima) and <b>Prophet</b> (Facebook) on your real data — three independent models, each from its own library.
     Use these numbers to compare against your existing SSA. Headline metric is <b>MASE</b> — scale-free, scored against the naïve baseline; lower is better and below 1.0 beats naïve.
     Fully isolated: it reads your data directly from MongoDB (read-only) — no token, no backend needed — and touches nothing in your app or your SSA service.</p>

  <div class="panel">
    <div class="row">
      <div class="fld"><label>Series</label><div class="seg" id="seriesSeg"></div></div>
      <div class="fld" id="itemWrap" style="display:none"><label>Item</label><select id="item"></select></div>
      <div class="fld"><label>Period</label><div class="seg" id="periodSeg"></div></div>
      <div class="fld"><label>Horizon</label><input id="horizon" type="number" min="1" max="12" value="4" style="width:80px"></div>
      <button class="run" id="runBtn">Run Benchmark</button>
    </div>
  </div>

  <div id="err" class="err" style="display:none"></div>
  <div id="out"></div>
  <p id="hint" class="muted">Pick a series and period, then <b style="color:var(--gold)">Run Benchmark</b>.</p>
</div>

<script>
const SERIES=[["sales_revenue","Sales Revenue",true],["sales_qty","Sales Quantity",false],["inventory","Inventory Demand",false]];
const PERIODS=[["weekly","Weekly"],["monthly","Monthly"],["annually","Annually"]];
const COLORS={SSA:"#d4a843",ARIMA:"#60a5fa",Prophet:"#34d399"};
let series="sales_revenue", period="weekly";
const $=id=>document.getElementById(id);

function seg(el,items,cur,on){ el.innerHTML=""; items.forEach(it=>{const b=document.createElement("button");b.textContent=it[1];b.className=it[0]===cur?"on":"";b.onclick=()=>on(it[0]);el.appendChild(b);}); }
function drawSeries(){ seg($("seriesSeg"),SERIES,series,v=>{series=v;drawSeries();$("itemWrap").style.display=v==="inventory"?"flex":"none";if(v==="inventory")loadItems();}); }
function drawPeriod(){ seg($("periodSeg"),PERIODS,period,v=>{period=v;drawPeriod();}); }
drawSeries(); drawPeriod();

async function loadItems(){
  try{
    const r=await fetch("/api/inventory-list-db");
    const d=await r.json(); if(!r.ok) throw new Error(d.detail||"failed");
    $("item").innerHTML=(d.items||[]).map(i=>`<option value="${i.id}">${i.name||i.id}</option>`).join("");
  }catch(e){ $("item").innerHTML="<option>(could not load items)</option>"; }
}

function fmtNum(v){ return v==null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2}); }

$("runBtn").onclick=async()=>{
  $("err").style.display="none"; $("out").innerHTML=""; $("hint").style.display="none";
  $("runBtn").disabled=true; $("runBtn").textContent="Running…";
  try{
    const body={series,forecast_type:period,forecast_periods:Number($("horizon").value)||4,inventory_id: series==="inventory"?$("item").value:null};
    const r=await fetch("/api/benchmark-db",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json(); if(!r.ok) throw new Error(d.detail||"Benchmark failed.");
    render(d);
  }catch(e){ showErr(e.message||"Something went wrong."); }
  finally{ $("runBtn").disabled=false; $("runBtn").textContent="Run Benchmark"; }
};

function showErr(m){ $("err").textContent=m; $("err").style.display="block"; }

function render(res){
  const money = SERIES.find(s=>s[0]===series)[2];
  const ranked=[...res.models].sort((a,b)=>(a.mase==null)-(b.mase==null)||(a.mase??9e9)-(b.mase??9e9));
  const nRanked=ranked.filter(r=>r.rank).length;
  const rc=r=>r===1?"#4ade80":r===2?"#d4a843":"#8b93a1";
  let h=`<div class="verdict"><span class="badge">${res.winner??"—"}</span>
    <span class="muted">is the strongest on this series, by MASE (lower is better; under 1 beats the seasonal-naive baseline).
    Backtest: ${res.backtest.windows} rolling window(s), ${res.backtest.test_points_per_model} test points/model${res.raw_points!=null?` · ${res.raw_points} raw records`:""}.</span></div>`;
  h+=`<div class="panel"><div class="chart-scroll"><table><thead><tr><th>Rank</th><th>Model</th><th>MASE</th><th>RMSE</th><th>MAE</th><th>sMAPE</th><th>Test pts</th></tr></thead><tbody>`;
  ranked.forEach(m=>{ h+=`<tr class="${m.rank===1?"win":""}">
    <td><span class="pill" style="color:${rc(m.rank)};background:${m.rank===1?"rgba(74,222,128,.12)":"transparent"}">${m.rank??"—"}</span></td>
    <td><span class="sw" style="background:${COLORS[m.model]||"#888"}"></span>${m.model}</td>
    <td style="font-weight:700;color:${m.rank===1?"#4ade80":"var(--tx)"}">${m.mase??"—"}</td>
    <td>${fmtNum(m.rmse)}</td><td>${fmtNum(m.mae)}</td><td>${m.smape!=null?m.smape+"%":"—"}</td><td>${m.n_test}</td></tr>`; });
  h+=`</tbody></table></div><p class="note">${res.metric_note}</p></div>`;
  h+=`<div class="panel"><label>Actual history &amp; forecast overlay</label>${chart(res,money)}</div>`;
  $("out").innerHTML=h;
}

function chart(res,money){
  // One panel per model. Overlaying three forecasts on a single axis made them
  // impossible to read against each other; separate panels on a SHARED y-scale
  // keep them comparable while letting each model be read on its own.
  const H=res.series.dates.map((d,i)=>({d,v:res.series.values[i]})).slice(-24);
  const fdates=res.forecast_dates||[];
  const W=1000,ht=190,pL=52,pR=14,pT=16,pB=24;
  const vals=H.map(x=>x.v);
  res.models.forEach(m=>(m.forecast||[]).forEach(v=>{if(v!=null)vals.push(v);}));
  if(vals.length===0) return "<p class='muted'>No data to plot.</p>";
  let mn=Math.min(...vals),mx=Math.max(...vals); const rng=(mx-mn)||1; mn-=rng*0.05; mx+=rng*0.05;
  const total=H.length+fdates.length;
  const X=i=>pL+(W-pL-pR)*(total<=1?0:i/(total-1));
  const Y=v=>pT+(ht-pT-pB)*(1-(v-mn)/(mx-mn));
  const aPts=H.map((x,i)=>`${X(i).toFixed(1)},${Y(x.v).toFixed(1)}`).join(" ");
  const bx=X(H.length-1), lastV=H.length?H[H.length-1].v:0;
  let grid=""; for(let g=0;g<=3;g++){ const yy=pT+(ht-pT-pB)*g/3; const val=mx-(mx-mn)*g/3;
    grid+=`<line x1="${pL}" y1="${yy}" x2="${W-pR}" y2="${yy}" stroke="#2a2f37" stroke-width="1"/><text x="${pL-6}" y="${yy+3}" fill="#8b93a1" font-size="10" text-anchor="end">${(money?"₱":"")+(Math.abs(val)>=1000?(val/1000).toFixed(1)+"k":Math.round(val))}</text>`; }
  const nowLine=`<line x1="${bx.toFixed(1)}" y1="${pT}" x2="${bx.toFixed(1)}" y2="${ht-pB}" stroke="#4ade80" stroke-width="1.2" stroke-dasharray="4 3"/><text x="${(bx+4).toFixed(1)}" y="${pT+10}" fill="#4ade80" font-size="10">now</text>`;

  const ranked=[...res.models].sort((a,b)=>(a.mase==null)-(b.mase==null)||(a.mase??9e9)-(b.mase??9e9));
  return ranked.map(m=>{
    const col=COLORS[m.model]||"#888";
    const fc=m.forecast||[]; const pts=[`${bx.toFixed(1)},${Y(lastV).toFixed(1)}`];
    for(let i=0;i<fdates.length;i++){ if(fc[i]!=null) pts.push(`${X(H.length+i).toFixed(1)},${Y(fc[i]).toFixed(1)}`); }
    const fline = pts.length>1 ? `<polyline fill="none" stroke="${col}" stroke-width="2.6" points="${pts.join(" ")}"/>` : "";
    const head = `<div style="display:flex;align-items:baseline;gap:10px;margin:14px 0 2px">
        <span class="sw" style="background:${col}"></span>
        <b style="font-size:14px">${m.model}</b>
        <span class="muted" style="font-size:12px">MASE ${m.mase??"—"}${m.mase!=null&&m.mase<1?" · beats naive":""}</span>
      </div>`;
    const failed = m.mase==null ? `<p class="muted" style="font-size:12px;margin:0 0 6px">No score - the model failed on this series.</p>` : "";
    return head+failed+`<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${ht}" width="100%" style="min-width:620px;display:block">${grid}${nowLine}<polyline fill="none" stroke="#e6e9ee" stroke-width="2.2" points="${aPts}"/>${fline}</svg></div>`;
  }).join("")
  + `<div class="lgd" style="margin-top:8px"><span><span class="sw" style="background:#e6e9ee"></span>Actual (same in every panel)</span></div>`;
}
</script></script>
</body></html>"""
