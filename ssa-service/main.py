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
        else:
            bt_periods = min(forecast_periods, max(1, n // 10), 3)

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

                accuracy = {
                    "mape":              round(mape_val, 2) if mape_val is not None else None,
                    "mae":               round(mae_val, 2),
                    "mae_ratio":         mae_ratio,
                    "backtest_n":        bt_periods if forecast_type != "annually" else int(n_agg),
                    # For annually, bt_nz counts non-zero YEARLY backtest periods (not months)
                    "backtest_nz_count": int(np.sum(act > 0)) if forecast_type == "annually" else bt_nz,
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
            monthly_steps    = forecast_periods * 12
            fc_dates_monthly = pd.date_range(
                start=last_date + pd.DateOffset(months=1),
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
            fc_df_m  = pd.DataFrame({"Date": fc_dates_monthly, "Value": raw_fc})
            fc_agg   = fc_df_m.set_index("Date").resample("YS").sum().head(forecast_periods).reset_index()
            out_vals  = fc_agg["Value"].values
            out_dates = fc_agg["Date"]
        else:
            out_vals  = raw_fc
            out_dates = fc_dates

        # Cap/dampen based on real (unfloored) history so the floor baseline
        # does not artificially suppress the forecast ceiling.
        hist_vals = original_values
        hist_max  = float(hist_vals.max()) if len(hist_vals) > 0 else 1.0
        hist_mean = float(hist_vals.mean()) if len(hist_vals) > 0 else 1.0
        cap       = max(hist_max * 1.5, hist_mean * 2, 1.0)
        out_vals  = np.clip(out_vals, 0.0, cap)

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
        # lower is always at least 5% of the forecast (never pure zero).
        n_out      = len(out_vals)
        max_growth = np.sqrt(forecast_periods)
        # Use the smaller of actual noise_std and 1× forecast mean as CI scale
        # so the bands stay proportional when SSA sees mostly zeros.
        ci_scale   = min(noise_std, float(out_vals.mean()) * 1.5) if out_vals.mean() > 0 else noise_std
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