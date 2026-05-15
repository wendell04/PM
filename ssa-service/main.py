from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pandas as pd
import numpy as np
from ssa import SSA, dominant_period

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DataRow(BaseModel):
    date: str
    value: float

class ForecastRequest(BaseModel):
    rows: List[DataRow]
    forecast_periods: int
    forecast_type: str
    data_type: str = "sales"  # "sales" | "stock"


class SaleRow(BaseModel):
    customerEmail: str
    totalPrice: float
    saleDate: str

class RFMRequest(BaseModel):
    sales: List[SaleRow]
    reference_date: str = None

class BasketRow(BaseModel):
    orderId: str
    productName: str

class MarketBasketRequest(BaseModel):
    transactions: List[BasketRow]
    min_support: float = 0.01
    min_confidence: float = 0.3
    min_lift: float = 1.0
    top_n: int = 20

class ServiceRow(BaseModel):
    productName: str
    totalPrice: float
    quantity: int = 1
    saleDate: str = None

class ServiceSegmentRequest(BaseModel):
    sales: List[ServiceRow]

class ComparativePeriod(BaseModel):
    period: str
    actual: float
    forecast: float = None

class ComparativeRequest(BaseModel):
    series: List[ComparativePeriod]
    threshold_pct: float = 20.0


# ── MAPE: computed only on weeks with actual sales ───────────────────────────
# Zero-actual weeks are excluded so we only measure accuracy on real sale events.
# Returns None when all backtest actuals are zero (mae_ratio fallback used instead).
def compute_mape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    mask = actual > 0
    if mask.sum() == 0:
        return None
    errors = np.abs((actual[mask] - predicted[mask]) / actual[mask])
    return float(np.mean(errors) * 100)


def _compute_last_period_value(
    original_values: np.ndarray,
    dates: "pd.Series",
    forecast_type: str,
) -> float:
    """Return the most meaningful 'last period' revenue value for display."""
    dates_dt = pd.to_datetime(dates)
    now = pd.Timestamp.now()

    if forecast_type == "annually":
        # Sum of last complete calendar year (avoids partial current year)
        prev_year = now.year - 1
        prev_mask = dates_dt.dt.year == prev_year
        if prev_mask.any():
            return float(original_values[prev_mask.values].sum())
        curr_mask = dates_dt.dt.year == now.year
        if curr_mask.any():
            return float(original_values[curr_mask.values].sum())
        return float(original_values[-1])

    if forecast_type == "monthly":
        # Last complete month (strictly before the current month/year)
        complete_mask = (dates_dt.dt.year < now.year) | (
            (dates_dt.dt.year == now.year) & (dates_dt.dt.month < now.month)
        )
        if complete_mask.any():
            return float(original_values[complete_mask.values][-1])
        return float(original_values[-1])

    # weekly: last complete week bin (W-MON label ≤ this week's Monday) + significance filter
    this_monday = now.normalize() - pd.Timedelta(days=now.dayofweek)
    complete_mask = dates_dt <= this_monday
    _nz = original_values[original_values > 0]
    _threshold = float(np.mean(_nz)) * 0.05 if len(_nz) > 0 else 0.0
    signif_complete = np.where(complete_mask.values & (original_values > _threshold))[0]
    if len(signif_complete) > 0:
        return float(original_values[signif_complete[-1]])
    if complete_mask.any():
        return float(original_values[complete_mask.values][-1])
    return float(original_values[-1])


@app.post("/api/forecast")
async def forecast(req: ForecastRequest):
    try:
        forecast_type    = req.forecast_type
        forecast_periods = req.forecast_periods
        is_stock         = (req.data_type == "stock")
        if forecast_type not in ("weekly", "monthly", "annually"):
            raise HTTPException(status_code=400, detail="Invalid forecast_type.")

        # Build a clean daily DataFrame from the raw rows
        df_raw = pd.DataFrame([{"Date": r.date, "Value": r.value} for r in req.rows])
        df_raw["Date"]  = pd.to_datetime(df_raw["Date"], errors="coerce")
        df_raw["Value"] = pd.to_numeric(df_raw["Value"], errors="coerce")
        df_raw = (
            df_raw.dropna(subset=["Date", "Value"])
                  .sort_values("Date")
                  .reset_index(drop=True)
        )
        if len(df_raw) == 0:
            raise HTTPException(status_code=400, detail="No valid data rows after parsing.")

        # Save the true last date BEFORE any resampling so we can detect
        # incomplete final periods and drop them.
        original_last_date = df_raw["Date"].max()

        # ── Resample to the SAME granularity as the display level ──────────────
        if forecast_type == "weekly":
            agg_rule = "W-MON"
            min_data  = 4 if is_stock else 10
        elif forecast_type == "monthly":
            agg_rule = "MS"
            min_data  = 3 if is_stock else 10
        else:   # annually — train on monthly, aggregate to years
            agg_rule = "MS"
            min_data  = 12 if is_stock else 24   # 1 year of monthly for stock

        if forecast_type == "annually":
            df = df_raw.set_index("Date").resample("MS").sum().reset_index()
        else:
            df = df_raw.set_index("Date").resample(agg_rule).sum().reset_index()

        # ── Drop the last (potentially incomplete) period ──────────────────────
        # Only drop the incomplete bin if it has ZERO sales. A sale on (e.g.)
        # Tuesday puts it in the W-MON bin ending the following Monday; that bin
        # is technically "incomplete" but carries real revenue and must be kept so
        # the forecast anchors to the current week, not months in the past.
        if len(df) > 1:
            last_bin_label = df["Date"].iloc[-1]
            if forecast_type == "weekly":
                if original_last_date < last_bin_label and df.iloc[-1]["Value"] == 0:
                    df = df.iloc[:-1].reset_index(drop=True)
            else:
                period_end = last_bin_label + pd.offsets.MonthEnd(1)
                if original_last_date < period_end and df.iloc[-1]["Value"] == 0:
                    df = df.iloc[:-1].reset_index(drop=True)

        # Trim trailing zeros — sales only. For inventory, zero stock IS valid data.
        trim_warning = None
        if not is_stock and len(df) > 0:
            vals   = df["Value"].values
            nz_pos = np.where(vals > 0)[0]
            if len(nz_pos) > 0:
                last_nz = int(nz_pos[-1])
                if last_nz < len(vals) - 1:
                    df = df.iloc[:last_nz + 1].reset_index(drop=True)

        # ── Floor zero periods for SSA training stability (sales only) ───────
        # For inventory stock, zeros are real out-of-stock states — don't floor.
        original_values = df["Value"].values.copy()
        if not is_stock:
            _nz_pre = original_values[original_values > 0]
            if len(_nz_pre) > 0:
                _floor_base = max(1.0, float(np.mean(_nz_pre)) * 0.005)
                _rng        = np.random.default_rng(seed=42)
                _noise_mul  = _rng.uniform(0.5, 1.5, size=len(df))
                _zero_mask  = original_values == 0
                if _zero_mask.any():
                    df = df.copy()
                    df.loc[_zero_mask, "Value"] = np.round(
                        _noise_mul[_zero_mask] * _floor_base, 2
                    )

        n = len(df)
        if n < min_data:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Not enough complete {forecast_type} periods ({n}). "
                    f"SSA requires at least {min_data}."
                    + (" Try switching to Monthly period." if is_stock and forecast_type == "weekly" else "")
                )
            )

        # ── Dynamic safe forecast horizon (N // 2 rule) ───────────────────────
        if forecast_type == "weekly":
            safe_max = min(n // 2, 52)
        elif forecast_type == "monthly":
            safe_max = min(n // 2, 12)
        else:
            safe_max = min(10, max(3, n // 4))

        safe_max = max(1, safe_max)

        if forecast_periods > safe_max:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Requested {forecast_periods} {forecast_type} periods exceeds the safe "
                    f"forecast horizon of {safe_max} for your {n} training data points "
                    f"(rule: N÷2 ≈ {n // 2}). Reduce to {safe_max} or fewer."
                )
            )

        # ── SSA window length ─────────────────────────────────────────────────
        period = dominant_period(df["Value"].values, acf_threshold=0.15)
        if forecast_type == "weekly":
            L = (period * 2) if (period and 3 <= period <= 26) else min(26, max(2, n // 2))
        elif forecast_type == "monthly":
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        else:
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        L = max(2, min(L, n // 2))

        ssa       = SSA(df["Value"].values, L=L)
        threshold = 0.01

        # ── FIX A: Sparsity-aware max_comp selection ──────────────────────────
        # With dense data, using 4 SSA components captures trend + multiple
        # seasonal harmonics. With sparse (mostly-zero) data, higher components
        # capture spike noise as if it were seasonality and project it forward —
        # inflating the forecast. Limit components based on the non-zero ratio
        # so the model stays conservative on intermittent demand series.
        # Sparsity and volatility computed on real (unfloored) values
        nonzero_ratio = float(np.sum(original_values > 0) / len(original_values))

        # ── CV / volatility detection ─────────────────────────────────────────
        # Coefficient of Variation on non-zero weeks measures demand volatility.
        # CV > 1.5 = highly erratic spike demand; model tracks trend, not timing.
        # trend_avg is exposed as the "baseline demand level" for the frontend.
        _nz_vals = original_values[original_values > 0]
        cv = float(np.std(_nz_vals) / np.mean(_nz_vals)) if len(_nz_vals) > 1 else 0.0
        is_high_volatility = cv > 1.5

        if forecast_type == "monthly" and n < 40:
            max_comp = 2
        elif forecast_type == "annually":
            max_comp = 4 if n >= 36 else 2
        elif nonzero_ratio < 0.30:
            # Very sparse weekly: only the trend component — seasonality is noise here
            max_comp = 1
        elif nonzero_ratio < 0.60:
            # Moderately sparse: trend + one harmonic
            max_comp = 2
        else:
            max_comp = 4

        components = [
            c for c in range(max_comp + 1)
            if c < len(ssa.Sigma) and ssa.Sigma[c] / ssa.Sigma[0] >= threshold
        ]
        if 0 not in components:
            components = [0] + components

        trend      = ssa.reconstruct(0)
        seasonal_c = [c for c in components if c > 0]
        seasonality = ssa.reconstruct(seasonal_c) if seasonal_c else np.zeros(n)
        noise       = df["Value"].values - trend - seasonality

        # trend_avg: the mean trend level over the full training period.
        # Used on the frontend as the "baseline demand" figure in the volatility banner.
        trend_avg = float(np.mean(trend)) if len(trend) > 0 else None

        # Compute noise_std on non-zero periods only to avoid inflation from sparse gaps
        nonzero_mask = original_values > 0
        noise_std = (
            float(np.std(noise[nonzero_mask])) if nonzero_mask.sum() > 1
            else float(np.std(noise))
        )

        # ── Backtest window sizing ─────────────────────────────────────────────
        if forecast_type == "weekly":
            bt_periods = min(forecast_periods, max(2, n // 5), 8)
        elif forecast_type == "monthly":
            bt_periods = min(forecast_periods, max(2, n // 5), 6)
        else:  # annually — 12 monthly periods = 1 full calendar year for backtest
            bt_periods = max(1, min(12, n - 10))

        # ── FIX 5: Smart backtest window ──────────────────────────────────────
        # For sparse data the tail window is often all-zeros → SMAPE = None.
        # Walk backward to find a window with the most non-zero actuals while
        # keeping at least 10 training rows. Fall back to tail if nothing better.
        def find_best_bt_start(values, bt_p, min_train=10):
            n_vals     = len(values)
            best_start = n_vals - bt_p
            best_nz    = int(np.sum(values[best_start:] > 0))
            for start in range(n_vals - bt_p, min_train - 1, -1):
                nz = int(np.sum(values[start:start + bt_p] > 0))
                if nz > best_nz:
                    best_nz    = nz
                    best_start = start
                if best_nz >= bt_p // 2:
                    break
            return best_start, best_nz

        accuracy        = {"mape": None, "mae": None, "backtest_n": bt_periods}
        backtest_series = {"dates": [], "actuals": [], "predictions": []}

        if n - bt_periods >= 10:
            try:
                if forecast_type != "annually":
                    # Use original (unfloored) values so the window finder correctly
                    # identifies real non-zero sale periods, not the SSA floor noise.
                    bt_start, bt_nz = find_best_bt_start(original_values, bt_periods)
                else:
                    bt_start = n - bt_periods
                    bt_nz    = int(np.sum(original_values[bt_start:] > 0))

                train_vals   = df["Value"].values[:bt_start]
                bt_actuals   = original_values[bt_start:bt_start + bt_periods]
                bt_raw_dates = df["Date"].values[bt_start:bt_start + bt_periods]

                if len(train_vals) < 10:
                    raise ValueError("Insufficient training rows after window shift.")

                L_bt    = max(2, min(L, len(train_vals) // 2))
                ssa_bt  = SSA(train_vals, L=L_bt)
                comps_bt = [
                    c for c in range(max_comp + 1)
                    if c < len(ssa_bt.Sigma) and ssa_bt.Sigma[c] / ssa_bt.Sigma[0] >= threshold
                ]
                if 0 not in comps_bt:
                    comps_bt = [0] + comps_bt

                bt_pred = ssa_bt.forecast(comps_bt, steps=bt_periods)
                bt_pred = np.clip(bt_pred, 0.0, float(train_vals.max()) * 3)

                if forecast_type == "annually":
                    act_s    = pd.Series(bt_actuals, index=pd.to_datetime(bt_raw_dates))
                    pred_s   = pd.Series(bt_pred,    index=pd.to_datetime(bt_raw_dates))
                    act_agg  = act_s.resample("YS").sum()
                    pred_agg = pred_s.resample("YS").sum()
                    n_agg    = min(len(act_agg), len(pred_agg))
                    act      = act_agg.values[:n_agg]
                    pred     = pred_agg.values[:n_agg]
                    bt_display_dates = act_agg.index[:n_agg]
                else:
                    act              = bt_actuals
                    pred             = bt_pred
                    bt_display_dates = pd.to_datetime(bt_raw_dates)

                mape_val = compute_mape(act, pred)
                mae_val  = float(np.mean(np.abs(act - pred)))

                # MAE-ratio fallback: used when all backtest actuals are zero
                # (MAPE returns None in that case — this gives a rough alternative)
                mae_ratio     = None
                nz_train_mean = (
                    float(np.mean(train_vals[train_vals > 0]))
                    if np.any(train_vals > 0) else None
                )
                if mape_val is None and nz_train_mean and nz_train_mean > 0:
                    mae_ratio = round((mae_val / nz_train_mean) * 100, 2)

                # Precision / Recall / F1 for direction accuracy (within 20% threshold)
                _bt_threshold = 0.20
                _bt_pct_err   = np.where(act > 0, np.abs(act - pred) / act, 0.0)
                _bt_within    = _bt_pct_err <= _bt_threshold
                _bt_median    = float(np.median(act))
                _bt_act_high  = act > _bt_median
                _bt_fc_high   = pred > _bt_median
                _bt_tp = float(np.sum(_bt_act_high & _bt_fc_high))
                _bt_fp = float(np.sum(~_bt_act_high & _bt_fc_high))
                _bt_fn = float(np.sum(_bt_act_high & ~_bt_fc_high))
                _bt_prec = _bt_tp / (_bt_tp + _bt_fp) if (_bt_tp + _bt_fp) > 0 else 0.0
                _bt_rec  = _bt_tp / (_bt_tp + _bt_fn) if (_bt_tp + _bt_fn) > 0 else 0.0
                _bt_f1   = 2 * _bt_prec * _bt_rec / (_bt_prec + _bt_rec) if (_bt_prec + _bt_rec) > 0 else 0.0

                accuracy = {
                    "mape":              round(mape_val, 2) if mape_val is not None else None,
                    "mae":               round(mae_val, 2),
                    "mae_ratio":         mae_ratio,
                    "backtest_n":        bt_periods if forecast_type != "annually" else int(n_agg),
                    "backtest_nz_count": int(np.sum(act > 0)) if forecast_type == "annually" else bt_nz,
                    "precision":         round(_bt_prec, 4),
                    "recall":            round(_bt_rec, 4),
                    "f1":                round(_bt_f1, 4),
                    "hit_rate":          round(float(np.mean(_bt_within)) * 100, 2),
                    "mape_reliable":     forecast_type != "annually" or int(n_agg) >= 2,
                }
                backtest_series = {
                    "dates":       pd.DatetimeIndex(bt_display_dates).strftime("%Y-%m-%d").tolist(),
                    "actuals":     act.tolist(),
                    "predictions": pred.tolist(),
                }
            except Exception:
                pass

        # ── Forecast ─────────────────────────────────────────────────────────
        last_date = df["Date"].iloc[-1]

        if forecast_type == "weekly":
            fc_dates = pd.date_range(
                start=last_date + pd.Timedelta(weeks=1),
                periods=forecast_periods,
                freq="W-MON",
            )
        elif forecast_type == "monthly":
            fc_dates = pd.date_range(
                start=last_date + pd.DateOffset(months=1),
                periods=forecast_periods,
                freq="MS",
            )
        else:
            forecast_start = last_date + pd.DateOffset(months=1)
            if forecast_start.month != 1:
                # Pad enough months so that after dropping the partial leading year
                # we still have exactly forecast_periods full calendar years.
                months_to_year_end = 12 - forecast_start.month + 1
                monthly_steps = months_to_year_end + forecast_periods * 12
            else:
                monthly_steps = forecast_periods * 12
            fc_dates_monthly = pd.date_range(
                start=forecast_start,
                periods=monthly_steps,
                freq="MS",
            )

        try:
            if forecast_type == "annually":
                raw_fc = ssa.forecast(components, steps=monthly_steps)
            else:
                raw_fc = ssa.forecast(components, steps=forecast_periods)
        except ValueError as lrf_err:
            raise HTTPException(
                status_code=400,
                detail="SSA forecasting failed: " + str(lrf_err),
            )

        if forecast_type == "annually":
            fc_df_m    = pd.DataFrame({"Date": fc_dates_monthly, "Value": raw_fc})
            fc_agg_all = fc_df_m.set_index("Date").resample("YS").sum().reset_index()
            if forecast_start.month != 1:
                # First YS bin covers only a partial year — skip it so the user
                # gets exactly forecast_periods complete calendar years.
                fc_agg = fc_agg_all.iloc[1:].head(forecast_periods).reset_index(drop=True)
            else:
                fc_agg = fc_agg_all.head(forecast_periods).reset_index(drop=True)
            out_vals  = fc_agg["Value"].values
            out_dates = fc_agg["Date"]
        else:
            out_vals  = raw_fc
            out_dates = fc_dates

        # Cap/dampen based on real (unfloored) history so the floor baseline
        # does not artificially suppress the forecast ceiling.
        hist_vals = original_values
        if forecast_type == "annually" and len(hist_vals) > 0:
            # hist_vals are monthly — aggregate to annual before computing cap
            # so the ceiling is proportional to annual forecast values.
            _ann_cap_s    = pd.Series(hist_vals, index=pd.to_datetime(df["Date"]))
            _ann_cap_sums = _ann_cap_s.resample("YS").sum().values
            hist_max  = float(_ann_cap_sums.max()) if len(_ann_cap_sums) > 0 else 1.0
            hist_mean = float(_ann_cap_sums.mean()) if len(_ann_cap_sums) > 0 else 1.0
        else:
            hist_max  = float(hist_vals.max()) if len(hist_vals) > 0 else 1.0
            hist_mean = float(hist_vals.mean()) if len(hist_vals) > 0 else 1.0
        cap      = max(hist_max * 1.5, hist_mean * 2, 1.0)
        out_vals = np.clip(out_vals, 0.0, cap)

        # ── Dampening + floor: sales-only (skip for inventory stock) ────────────
        is_dampened = False
        if not is_stock:
            # FIX C-1: dampening — cap SSA overshot vs recent actuals at 1.5×
            if forecast_type == "annually":
                _ann_hist = (
                    pd.Series(hist_vals, index=pd.to_datetime(df["Date"]))
                    .resample("YS").sum()
                    .values
                )
                _ann_window = min(3, len(_ann_hist))
                recent_mean = float(_ann_hist[-_ann_window:].mean()) if _ann_window > 0 else 0.0
            else:
                recent_window = min(8, len(hist_vals))
                recent_slice  = hist_vals[-recent_window:]
                _nz_recent    = recent_slice[recent_slice > 0]
                recent_mean   = float(_nz_recent.mean()) if len(_nz_recent) > 0 else float(recent_slice.mean())
            forecast_mean = float(out_vals.mean())
            if recent_mean > 0 and forecast_mean > recent_mean * 1.5:
                dampen_target = recent_mean * 1.5
                out_vals      = out_vals * (dampen_target / forecast_mean)
                is_dampened   = True

            # FIX C-2: floor sparse-demand forecast at 60% of recent non-zero mean
            if forecast_type in ("weekly", "monthly"):
                nz_recent = hist_vals[-26:] if forecast_type == "weekly" else hist_vals[-12:]
                nz_recent = nz_recent[nz_recent > 0]
                if len(nz_recent) > 0:
                    nz_floor  = float(nz_recent.mean()) * 0.6
                    raw_range = float(out_vals.max() - out_vals.min())
                    if raw_range > 0:
                        normalized   = (out_vals - out_vals.min()) / raw_range
                        shaped_floor = nz_floor * (0.8 + normalized * 0.4)
                    else:
                        shaped_floor = np.full_like(out_vals, nz_floor)
                    out_vals = np.maximum(out_vals, shaped_floor)

        # ── FIX 4: Cap CI growth so it doesn't explode on long horizons ──────
        # noise_std on sparse spike data can be very large (residuals from spike
        # weeks dominate). Cap CI so upper never exceeds the historical max and
        # lower is always at least 20% of the forecast (never pure zero).
        n_out      = len(out_vals)
        max_growth = np.sqrt(forecast_periods)
        if forecast_type == "annually":
            # noise_std is monthly-scale; scale to annual uncertainty via √12.
            # CI ceiling and cap must also use annual-aggregated history, not monthly max.
            _ann_ci_noise = noise_std * np.sqrt(12)
            ci_scale = min(_ann_ci_noise, float(out_vals.mean()) * 1.5) if out_vals.mean() > 0 else _ann_ci_noise
            if len(hist_vals) > 0:
                _ann_ci_s   = pd.Series(hist_vals, index=pd.to_datetime(df["Date"]))
                _ann_ci_max = float(_ann_ci_s.resample("YS").sum().max())
                hist_max_ceiling = _ann_ci_max * 1.5
            else:
                hist_max_ceiling = float("inf")
        else:
            ci_scale = min(noise_std, float(out_vals.mean()) * 1.5) if out_vals.mean() > 0 else noise_std
            hist_max_ceiling = float(hist_vals.max()) * 1.2 if len(hist_vals) > 0 else float("inf")
        conf_high  = [
            float(min(hist_max_ceiling, out_vals[i] + 1.96 * ci_scale * min(np.sqrt(i + 1), max_growth)))
            for i in range(n_out)
        ]
        conf_low = [
            float(max(out_vals[i] * 0.20, out_vals[i] - 1.96 * ci_scale * min(np.sqrt(i + 1), max_growth)))
            for i in range(n_out)
        ]

        # ── Build daily historical for chart display ─────────────────────────
        last_train_date = df["Date"].iloc[-1]
        all_days = pd.date_range(
            start=df_raw["Date"].min(),
            end=last_train_date,
            freq="D",
        )
        if is_stock:
            # Forward-fill: stock level holds until next movement
            daily_rev = (
                df_raw[df_raw["Date"] <= last_train_date]
                .groupby("Date")["Value"]
                .last()
                .reindex(all_days)
                .ffill()
                .fillna(0.0)
                .reset_index()
            )
        else:
            daily_rev = (
                df_raw[df_raw["Date"] <= last_train_date]
                .groupby("Date")["Value"]
                .sum()
                .reindex(all_days, fill_value=0.0)
                .reset_index()
            )
        daily_rev.columns = ["Date", "Value"]

        # Floor zero-sale days (sales only — inventory already forward-filled)
        if not is_stock:
            _daily_nz = daily_rev["Value"].values[daily_rev["Value"].values > 0]
            if len(_daily_nz) > 0:
                _daily_floor_base = max(100.0, float(np.mean(_daily_nz)) * 0.15)
                _daily_rng   = np.random.default_rng(seed=99)
                _daily_muls  = _daily_rng.uniform(0.5, 1.5, size=len(daily_rev))
                _daily_zero  = daily_rev["Value"].values == 0
                if _daily_zero.any():
                    daily_rev = daily_rev.copy()
                    daily_rev.loc[_daily_zero, "Value"] = np.round(
                        _daily_muls[_daily_zero] * _daily_floor_base, 2
                    )

        train_ts    = df["Date"].astype(np.int64).values
        daily_ts    = daily_rev["Date"].astype(np.int64).values
        trend_daily = np.interp(daily_ts, train_ts, trend)
        seas_daily  = np.interp(daily_ts, train_ts, seasonality)
        noise_daily = daily_rev["Value"].values - trend_daily - seas_daily

        training_periods = len(df)
        if training_periods < 2:
            raise HTTPException(
                status_code=400,
                detail="Not enough historical data points after aggregation.",
            )

        # ── Last-period value for display ────────────────────────────────────
        if is_stock:
            # For inventory, show current stock level (most recent known qty)
            _last_period_val = float(df_raw["Value"].iloc[-1])
        else:
            _raw_daily_sums = df_raw.groupby("Date")["Value"].sum().sort_index()
            _anchor = _raw_daily_sums.index.max()
            if forecast_type == "weekly":
                _last_period_val = float(
                    _raw_daily_sums[_raw_daily_sums.index >= _anchor - pd.Timedelta(days=6)].sum()
                )
            elif forecast_type == "monthly":
                _last_period_val = float(
                    _raw_daily_sums[_raw_daily_sums.index >= _anchor - pd.Timedelta(days=29)].sum()
                )
            else:
                _last_period_val = _compute_last_period_value(
                    original_values, df["Date"], "annually"
                )

        return {
            "historical": {
                "dates":       daily_rev["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "values":      daily_rev["Value"].tolist(),
                "trend":       trend_daily.tolist(),
                "seasonality": seas_daily.tolist(),
                "noise":       noise_daily.tolist(),
            },
            "forecast": {
                "dates":           pd.DatetimeIndex(out_dates).strftime("%Y-%m-%d").tolist(),
                "values":          out_vals.tolist(),
                "confidence_high": conf_high,
                "confidence_low":  conf_low,
            },
            # last_period_value:
            # - weekly:   trailing 7-day raw total anchored to the last sale date
            # - monthly:  trailing 30-day raw total anchored to the last sale date
            # - annually: last complete calendar year sum
            # Weekly and monthly both anchor to the SAME recent date, so they are
            # always proportional (monthly ≥ weekly) and never show a historical spike.
            "last_period_value": _last_period_val,
            "data_quality": {
                "hist_agg_count":    len(daily_rev),
                "training_periods":  training_periods,
                "is_low_confidence": training_periods < 5,
                "trim_warning":      trim_warning,
            },
            "accuracy":          accuracy,
            "backtest_series":   backtest_series,
            "auto_L":            {"L_used": L, "period_detected": int(period) if period else None},
            "granularity":       "daily",
            "safe_max":          safe_max,
            "training_n":        n,
            # Actual unit of the training rows (annually trains on monthly buckets)
            "training_unit":     "months" if forecast_type == "annually" else (
                                     "weeks" if forecast_type == "weekly" else "months"
                                 ),
            "forecast_dampened": is_dampened,
            "nonzero_ratio":     round(nonzero_ratio, 4),
            # ── Volatility / CV fields ────────────────────────────────────────
            # is_high_volatility: true when CV > 1.5 (spike-demand pattern).
            # cv: coefficient of variation on non-zero weekly buckets.
            # trend_avg: mean SSA trend value — used as "baseline demand" label.
            "is_high_volatility": is_high_volatility,
            "cv":                 round(cv, 2),
            "trend_avg":          round(trend_avg, 2) if trend_avg is not None else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=str(e) + "\n" + traceback.format_exc(),
        )


# ── RFM Customer Segmentation ─────────────────────────────────────────────

def _rfm_label(r: int, f: int, m: int) -> str:
    if r >= 4 and f >= 4 and m >= 4:
        return "Champions"
    if r >= 3 and f >= 3 and m >= 3:
        return "Loyal Customers"
    if r >= 3 and f <= 2 and m >= 3:
        return "Potential Loyalists"
    if r >= 4 and f <= 1:
        return "New Customers"
    if r == 3 and f <= 2 and m <= 2:
        return "Promising"
    if r <= 2 and f >= 3 and m >= 3:
        return "At Risk"
    if r <= 2 and f >= 3:
        return "Can't Lose Them"
    if r <= 2 and f <= 2 and m >= 3:
        return "Hibernating"
    if r == 1 and f == 1 and m == 1:
        return "Lost"
    return "Need Attention"


@app.post("/api/customer-segments")
async def customer_segments(req: RFMRequest):
    try:
        if not req.sales:
            raise HTTPException(status_code=400, detail="No sales data provided.")

        df = pd.DataFrame([{
            "email":  s.customerEmail,
            "amount": s.totalPrice,
            "date":   pd.to_datetime(s.saleDate, errors="coerce"),
        } for s in req.sales])
        df = df.dropna(subset=["date"])
        if df.empty:
            raise HTTPException(status_code=400, detail="No valid sale rows after date parsing.")

        # Strip timezone info so tz-aware MongoDB dates don't clash with tz-naive Timestamp
        if df["date"].dt.tz is not None:
            df["date"] = df["date"].dt.tz_convert("UTC").dt.tz_localize(None)

        ref_date = (
            pd.to_datetime(req.reference_date).tz_localize(None)
            if req.reference_date
            else pd.Timestamp.now(tz=None)
        )

        rfm = df.groupby("email").agg(
            recency=("date",   lambda x: (ref_date - x.max()).days),
            frequency=("date", "count"),
            monetary=("amount","sum"),
        ).reset_index()

        def _qscore(series, ascending=True):
            labels = [1, 2, 3, 4, 5] if ascending else [5, 4, 3, 2, 1]
            try:
                return pd.qcut(series, q=5, labels=labels, duplicates="drop").astype(int)
            except ValueError:
                ranked = series.rank(method="first", ascending=ascending)
                return pd.cut(ranked, bins=5, labels=[1, 2, 3, 4, 5]).astype(int)

        rfm["r_score"] = _qscore(rfm["recency"],   ascending=False)
        rfm["f_score"] = _qscore(rfm["frequency"],  ascending=True)
        rfm["m_score"] = _qscore(rfm["monetary"],   ascending=True)
        rfm["rfm_score"] = rfm["r_score"] + rfm["f_score"] + rfm["m_score"]
        rfm["segment"]   = rfm.apply(lambda r: _rfm_label(r["r_score"], r["f_score"], r["m_score"]), axis=1)

        customers = rfm.round(2).to_dict(orient="records")
        summary = (
            rfm.groupby("segment")
            .agg(
                count=("email",     "count"),
                avg_recency=("recency",   "mean"),
                avg_frequency=("frequency","mean"),
                avg_monetary=("monetary", "mean"),
                total_monetary=("monetary","sum"),
            )
            .round(2).reset_index().to_dict(orient="records")
        )

        return {"customers": customers, "summary": summary, "total_customers": len(rfm)}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


# ── Market Basket Analysis ────────────────────────────────────────────────

def _apriori(transactions: list, min_support: float, max_len: int = 3):
    """Pure-Python Apriori — no external dependencies."""
    from itertools import combinations

    n = len(transactions)
    if n == 0:
        return []

    txn_sets = [frozenset(t) for t in transactions]
    all_items = sorted({item for t in txn_sets for item in t})

    freq: list = []
    prev_freq_sets: list = [frozenset([item]) for item in all_items]

    for k in range(1, max_len + 1):
        candidates = prev_freq_sets if k == 1 else [
            a | b
            for i, a in enumerate(prev_freq_sets)
            for b in prev_freq_sets[i + 1:]
            if len(a | b) == k
        ]
        # Deduplicate
        seen: set = set()
        unique_cands = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                unique_cands.append(c)

        next_freq: list = []
        for cand in unique_cands:
            sup = sum(1 for t in txn_sets if cand.issubset(t)) / n
            if sup >= min_support:
                freq.append({"itemsets": cand, "support": sup})
                next_freq.append(cand)

        if not next_freq:
            break
        prev_freq_sets = next_freq

    return freq


def _assoc_rules(freq_list: list, min_confidence: float, min_lift: float, top_n: int):
    from itertools import combinations

    support_map = {item["itemsets"]: item["support"] for item in freq_list}
    rules = []

    for item in freq_list:
        itemset = item["itemsets"]
        if len(itemset) < 2:
            continue
        for size in range(1, len(itemset)):
            for ant in combinations(list(itemset), size):
                ant_set  = frozenset(ant)
                con_set  = itemset - ant_set
                ant_sup  = support_map.get(ant_set, 0)
                con_sup  = support_map.get(con_set, 0)
                if ant_sup == 0:
                    continue
                confidence = item["support"] / ant_sup
                lift       = confidence / con_sup if con_sup > 0 else 0
                if confidence >= min_confidence and lift >= min_lift:
                    conv = (1 - con_sup) / (1 - confidence) if confidence < 1 else float("inf")
                    rules.append({
                        "antecedents": sorted(list(ant_set)),
                        "consequents": sorted(list(con_set)),
                        "support":    round(item["support"], 4),
                        "confidence": round(confidence, 4),
                        "lift":       round(lift, 4),
                        "conviction": round(conv, 4) if not np.isinf(conv) else 999.0,
                    })

    rules.sort(key=lambda r: r["lift"], reverse=True)
    return rules[:top_n]


@app.post("/api/market-basket")
async def market_basket(req: MarketBasketRequest):
    try:
        if not req.transactions:
            raise HTTPException(status_code=400, detail="No transaction data provided.")

        orders: dict = {}
        for row in req.transactions:
            orders.setdefault(row.orderId, set()).add(row.productName)

        if len(orders) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 orders for basket analysis.")

        transactions = [list(items) for items in orders.values()]
        all_products = sorted({item for t in transactions for item in t})

        freq_list = _apriori(transactions, min_support=req.min_support, max_len=3)

        if not freq_list:
            return {
                "rules": [], "frequent_itemsets": [],
                "total_orders": len(orders), "total_products": len(all_products),
                "message": "No frequent itemsets found. Try lowering min_support.",
            }

        rules_out = _assoc_rules(freq_list, req.min_confidence, req.min_lift, req.top_n)

        freq_out = sorted(freq_list, key=lambda x: x["support"], reverse=True)[:50]
        freq_out = [{"itemset": sorted(list(f["itemsets"])), "support": round(f["support"], 4)} for f in freq_out]

        return {
            "rules": rules_out,
            "frequent_itemsets": freq_out,
            "total_orders": len(orders),
            "total_products": len(all_products),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


# ── Service Segmentation ──────────────────────────────────────────────────

@app.post("/api/service-segments")
async def service_segments(req: ServiceSegmentRequest):
    try:
        if not req.sales:
            raise HTTPException(status_code=400, detail="No sales data provided.")

        df = pd.DataFrame([{
            "service":  s.productName,
            "revenue":  s.totalPrice,
            "quantity": s.quantity,
            "date":     s.saleDate,
        } for s in req.sales])

        summary = (
            df.groupby("service")
            .agg(
                total_revenue=("revenue",  "sum"),
                order_count=("revenue",    "count"),
                avg_price=("revenue",      "mean"),
                total_quantity=("quantity","sum"),
            )
            .round(2).reset_index()
            .sort_values("total_revenue", ascending=False)
            .reset_index(drop=True)
        )

        total_rev = float(summary["total_revenue"].sum())
        summary["revenue_share"] = (summary["total_revenue"] / total_rev).round(4) if total_rev > 0 else 0.0

        cumulative = summary["total_revenue"].cumsum() / total_rev
        summary["abc_class"] = "C"
        summary.loc[cumulative <= 0.70,                        "abc_class"] = "A"
        summary.loc[(cumulative > 0.70) & (cumulative <= 0.90),"abc_class"] = "B"

        services_out = summary.to_dict(orient="records")

        trend_out: dict = {}
        try:
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            df_v = df.dropna(subset=["date"]).copy()
            if not df_v.empty:
                df_v["month"] = df_v["date"].dt.to_period("M").astype(str)
                for svc, grp in df_v.groupby("service"):
                    monthly = grp.groupby("month")["revenue"].sum().reset_index()
                    trend_out[svc] = {
                        "months":  monthly["month"].tolist(),
                        "revenue": monthly["revenue"].round(2).tolist(),
                    }
        except Exception:
            pass

        return {
            "services":         services_out,
            "total_revenue":    round(total_rev, 2),
            "total_services":   len(summary),
            "top_services":     services_out[:5],
            "bottom_services":  services_out[-5:] if len(services_out) > 5 else [],
            "trend_by_service": trend_out,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


# ── Comparative Analysis ──────────────────────────────────────────────────

@app.post("/api/comparative")
async def comparative_analysis(req: ComparativeRequest):
    try:
        paired = [s for s in req.series if s.actual is not None and s.forecast is not None]
        if len(paired) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 periods with both actual and forecast.")

        actuals   = np.array([s.actual   for s in paired], dtype=float)
        forecasts = np.array([s.forecast for s in paired], dtype=float)
        threshold = req.threshold_pct / 100.0

        abs_err  = np.abs(actuals - forecasts)
        pct_err  = np.where(actuals > 0, abs_err / actuals, 0.0)
        within   = pct_err <= threshold

        mape = float(np.mean(pct_err[actuals > 0]) * 100) if np.any(actuals > 0) else None
        mae  = float(np.mean(abs_err))
        rmse = float(np.sqrt(np.mean((actuals - forecasts) ** 2)))
        bias = float(np.mean(forecasts - actuals))
        bias_pct = float(np.mean((forecasts - actuals) / actuals[actuals > 0]) * 100) if np.any(actuals > 0) else None

        median_act   = float(np.median(actuals))
        act_high     = actuals   > median_act
        fc_high      = forecasts > median_act
        tp = float(np.sum( act_high &  fc_high))
        fp = float(np.sum(~act_high &  fc_high))
        fn = float(np.sum( act_high & ~fc_high))
        tn = float(np.sum(~act_high & ~fc_high))
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        acc_cls   = (tp + tn) / len(actuals)

        comparison = [
            {
                "period":           s.period,
                "actual":           s.actual,
                "forecast":         s.forecast,
                "error":            round(float(abs_err[i]), 2),
                "pct_error":        round(float(pct_err[i] * 100), 2),
                "within_threshold": bool(within[i]),
                "direction":        "over" if forecasts[i] > actuals[i] else ("under" if forecasts[i] < actuals[i] else "exact"),
            }
            for i, s in enumerate(paired)
        ]

        return {
            "comparison":    comparison,
            "total_periods": len(paired),
            "median_actual": round(median_act, 2),
            "metrics": {
                "mape":          round(mape, 2) if mape is not None else None,
                "mae":           round(mae, 2),
                "rmse":          round(rmse, 2),
                "bias":          round(bias, 2),
                "bias_pct":      round(bias_pct, 2) if bias_pct is not None else None,
                "precision":     round(precision, 4),
                "recall":        round(recall,    4),
                "f1":            round(f1,         4),
                "accuracy":      round(acc_cls,    4),
                "hit_rate":      round(float(np.mean(within)) * 100, 2),
                "threshold_pct": req.threshold_pct,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())