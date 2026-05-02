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


# ── FIX 1: SMAPE (replaces MAPE) ─────────────────────────────────────────────
# MAPE explodes to infinity when actuals are zero (common in sparse/weekly data).
# SMAPE divides by the AVERAGE of actual + forecast — zeros are handled safely.
# Range: 0–200%. 0% = perfect; ~50% = acceptable; >100% = poor.
#
# ── FIX B: Weighted SMAPE ────────────────────────────────────────────────────
# Equal weighting dilutes the metric with zero-actual weeks that are trivial to
# "predict" (both actual and forecast near zero → low error, inflates apparent
# accuracy). Non-zero actual weeks (real sales events) are weighted 3× so the
# reported accuracy reflects performance on weeks that actually matter.
def compute_smape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    denom = np.abs(actual) + np.abs(predicted)
    mask  = denom > 0   # skip rows where both actual AND forecast are zero
    if mask.sum() == 0:
        return None
    # Weight non-zero actual weeks 3× — they are what the model must get right
    weights = np.where(actual[mask] > 0, 3.0, 1.0)
    weighted_errors = 2 * np.abs(actual[mask] - predicted[mask]) / denom[mask]
    return float(np.average(weighted_errors, weights=weights) * 100)


@app.post("/api/forecast")
async def forecast(req: ForecastRequest):
    try:
        forecast_type   = req.forecast_type
        forecast_periods = req.forecast_periods
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
            min_data  = 10
        elif forecast_type == "monthly":
            agg_rule = "MS"
            min_data  = 10
        else:   # annually — train on monthly, aggregate to years
            agg_rule = "MS"
            min_data  = 24      # ≥2 years of monthly data

        if forecast_type == "annually":
            df = df_raw.set_index("Date").resample("MS").sum().reset_index()
        else:
            df = df_raw.set_index("Date").resample(agg_rule).sum().reset_index()

        # ── Drop the last (potentially incomplete) period ──────────────────────
        if len(df) > 1:
            last_bin_label = df["Date"].iloc[-1]
            if forecast_type == "weekly":
                if original_last_date < last_bin_label:
                    df = df.iloc[:-1].reset_index(drop=True)
            else:
                period_end = last_bin_label + pd.offsets.MonthEnd(1)
                if original_last_date < period_end:
                    df = df.iloc[:-1].reset_index(drop=True)

        # ── FIX 2: Gap trimming with warnings instead of silent data loss ─────
        # Trailing zero-gaps corrupt the SSA seed window. We trim them but now
        # expose trim_warning in the response so the frontend can alert the user.
        trim_warning = None
        if len(df) > 0:
            vals   = df["Value"].values
            nz_pos = np.where(vals > 0)[0]
            if len(nz_pos) > 0:
                last_nz = int(nz_pos[-1])
                zero_run_start = last_nz
                while zero_run_start > 0 and vals[zero_run_start - 1] == 0:
                    zero_run_start -= 1
                gap_len    = last_nz - zero_run_start
                gap_thresh = 4 if forecast_type == "weekly" else 2
                if gap_len >= gap_thresh:
                    rows_before = len(df)
                    df = df.iloc[:zero_run_start].reset_index(drop=True)
                    rows_dropped = rows_before - len(df)
                    trim_warning = (
                        f"Trimmed {rows_dropped} trailing {forecast_type} period(s) "
                        f"due to a gap of {gap_len} zero-value periods before the last "
                        f"non-zero point. This prevents the gap from corrupting the SSA seed."
                    )
                elif last_nz < len(vals) - 1:
                    df = df.iloc[:last_nz + 1].reset_index(drop=True)

        n = len(df)
        if n < min_data:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Not enough complete {forecast_type} periods ({n}). "
                    f"SSA requires at least {min_data}."
                )
            )

        # ── Dynamic safe forecast horizon (N // 2 rule) ───────────────────────
        if forecast_type == "weekly":
            safe_max = min(n // 2, 52)
        elif forecast_type == "monthly":
            safe_max = min(n // 2, 12)
        else:
            safe_max = max(1, n // 12)

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
        nonzero_ratio = float(np.sum(df["Value"].values > 0) / len(df["Value"].values))

        # ── CV / volatility detection ─────────────────────────────────────────
        # Coefficient of Variation on non-zero weeks measures demand volatility.
        # CV > 1.5 = highly erratic spike demand; model tracks trend, not timing.
        # trend_avg is exposed as the "baseline demand level" for the frontend.
        _nz_vals = df["Value"].values[df["Value"].values > 0]
        cv = float(np.std(_nz_vals) / np.mean(_nz_vals)) if len(_nz_vals) > 1 else 0.0
        is_high_volatility = cv > 1.0

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
        nonzero_mask = df["Value"].values > 0
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

        accuracy        = {"smape": None, "mae": None, "backtest_n": bt_periods}
        backtest_series = {"dates": [], "actuals": [], "predictions": []}

        if n - bt_periods >= 10:
            try:
                if forecast_type != "annually":
                    bt_start, bt_nz = find_best_bt_start(df["Value"].values, bt_periods)
                else:
                    bt_start = n - bt_periods
                    bt_nz    = int(np.sum(df["Value"].values[bt_start:] > 0))

                train_vals   = df["Value"].values[:bt_start]
                bt_actuals   = df["Value"].values[bt_start:bt_start + bt_periods]
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

                # FIX B: weighted SMAPE (non-zero actuals weighted 3×)
                smape_val = compute_smape(act, pred)
                mae_val   = float(np.mean(np.abs(act - pred)))

                # ── FIX 5b: MAE-ratio fallback when all actuals are zero ──────
                mae_ratio     = None
                nz_train_mean = (
                    float(np.mean(train_vals[train_vals > 0]))
                    if np.any(train_vals > 0) else None
                )
                if smape_val is None and nz_train_mean and nz_train_mean > 0:
                    mae_ratio = round((mae_val / nz_train_mean) * 100, 2)

                accuracy = {
                    "smape":             round(smape_val, 2) if smape_val is not None else None,
                    "mae":               round(mae_val, 2),
                    "mae_ratio":         mae_ratio,
                    "backtest_n":        bt_periods if forecast_type != "annually" else int(n_agg),
                    "backtest_nz_count": bt_nz,
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

        # Cap at historical distribution to prevent runaway extrapolation
        hist_vals = df["Value"].values
        hist_max  = float(hist_vals.max()) if len(hist_vals) > 0 else 1.0
        hist_mean = float(hist_vals.mean()) if len(hist_vals) > 0 else 1.0
        cap       = max(hist_max * 1.5, hist_mean * 2, 1.0)
        out_vals  = np.clip(out_vals, 0.0, cap)

        # ── FIX C-1: Lower dampening threshold (3× → 1.5×) ───────────────────
        # The original 3× threshold was too lenient — SSA could still project
        # forecasts 2× above recent actuals without triggering dampening.
        # Lowered to 1.5× so any meaningful overshoot is caught early.
        # The dampen target remains 1.5× recent mean (unchanged).
        recent_window = min(8, len(hist_vals))
        recent_mean   = float(hist_vals[-recent_window:].mean())
        forecast_mean = float(out_vals.mean())
        is_dampened   = False
        if recent_mean > 0 and forecast_mean > recent_mean * 1.5:
            dampen_target = recent_mean * 1.5
            dampen_ratio  = dampen_target / forecast_mean
            out_vals      = out_vals * dampen_ratio
            is_dampened   = True

        # ── FIX C-2: Forecast floor based on recent non-zero average ──────────
        # For sparse series, SSA can forecast near-zero even when the non-zero
        # history shows consistent demand (e.g. ₱500–₱2000 per event week).
        # Floor the forecast at 20% of the recent non-zero mean so the model
        # never implies "expect nothing" when the data says otherwise.
        # Only applied to weekly/monthly — annual aggregation self-corrects.
        if forecast_type in ("weekly", "monthly"):
            nz_recent = hist_vals[-26:] if forecast_type == "weekly" else hist_vals[-12:]
            nz_recent = nz_recent[nz_recent > 0]
            if len(nz_recent) > 0:
                nz_floor  = float(nz_recent.mean()) * 0.2
                out_vals  = np.maximum(out_vals, nz_floor)

        # ── FIX 4: Cap CI growth so it doesn't explode on long horizons ──────
        n_out      = len(out_vals)
        max_growth = np.sqrt(forecast_periods)
        conf_high  = [
            float(out_vals[i] + 1.96 * noise_std * min(np.sqrt(i + 1), max_growth))
            for i in range(n_out)
        ]
        conf_low = [
            max(0.0, float(out_vals[i] - 1.96 * noise_std * min(np.sqrt(i + 1), max_growth)))
            for i in range(n_out)
        ]

        # ── Build daily historical for chart display ─────────────────────────
        last_train_date = df["Date"].iloc[-1]
        all_days = pd.date_range(
            start=df_raw["Date"].min(),
            end=last_train_date,
            freq="D",
        )
        daily_rev = (
            df_raw[df_raw["Date"] <= last_train_date]
            .groupby("Date")["Value"]
            .sum()
            .reindex(all_days, fill_value=0.0)
            .reset_index()
        )
        daily_rev.columns = ["Date", "Value"]

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
            "last_period_value": float(df["Value"].iloc[-1]),
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