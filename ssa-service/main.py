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

@app.post("/api/forecast")
async def forecast(req: ForecastRequest):
    try:
        forecast_type = req.forecast_type
        forecast_periods = req.forecast_periods
        if forecast_type not in ("weekly", "monthly", "annually"):
            raise HTTPException(status_code=400, detail="Invalid forecast_type.")

        # Build a clean daily DataFrame from the raw rows
        df_raw = pd.DataFrame([{"Date": r.date, "Value": r.value} for r in req.rows])
        df_raw["Date"]  = pd.to_datetime(df_raw["Date"], errors="coerce")
        df_raw["Value"] = pd.to_numeric(df_raw["Value"], errors="coerce")
        df_raw = df_raw.dropna(subset=["Date", "Value"]).sort_values("Date").reset_index(drop=True)
        if len(df_raw) == 0:
            raise HTTPException(status_code=400, detail="No valid data rows after parsing.")

        # Save the true last date BEFORE any resampling so we can detect incomplete final periods
        original_last_date = df_raw["Date"].max()

        # ── Resample to the SAME granularity as the display level ──────────────
        if forecast_type == "weekly":
            agg_rule = "W-MON"
            min_data  = 10
        elif forecast_type == "monthly":
            agg_rule = "MS"
            min_data  = 10
        else:  # annually — train on monthly, aggregate to years
            agg_rule  = "MS"
            min_data  = 24          # ≥2 years of monthly data

        if forecast_type == "annually":
            df = df_raw.set_index("Date").resample("MS").sum().reset_index()
        else:
            df = df_raw.set_index("Date").resample(agg_rule).sum().reset_index()

        # ── Drop the last (potentially incomplete) period ──────────────────────
        # W-MON label = the closing Monday of the week; MS label = first day of month.
        # Drop if the original data hasn't reached the end of the bin yet.
        if len(df) > 1:
            last_bin_label = df["Date"].iloc[-1]
            if forecast_type == "weekly":
                if original_last_date < last_bin_label:
                    df = df.iloc[:-1].reset_index(drop=True)
            else:  # monthly or annually (monthly training)
                period_end = last_bin_label + pd.offsets.MonthEnd(1)
                if original_last_date < period_end:
                    df = df.iloc[:-1].reset_index(drop=True)

        # ── Trim trailing data-gap artifacts ─────────────────────────────────
        # Two patterns corrupt the LRF seed and must be removed from the tail:
        #   (A) Trailing zeros  — no sales entered for recent periods
        #   (B) Gap + isolated spike — a long zero run followed by a lone non-zero
        #       point (e.g. a test sale after months of silence)
        # Strategy: find the last non-zero point; if it is preceded by a long run
        # of zeros (≥ gap_thresh periods), drop from the start of that zero run.
        # Otherwise just drop any trailing zeros after the last non-zero point.
        if len(df) > 0:
            vals = df["Value"].values
            nz_pos = np.where(vals > 0)[0]
            if len(nz_pos) > 0:
                last_nz = int(nz_pos[-1])
                # Count consecutive zeros immediately before the last non-zero
                zero_run_start = last_nz
                while zero_run_start > 0 and vals[zero_run_start - 1] == 0:
                    zero_run_start -= 1
                gap_len = last_nz - zero_run_start
                # For weekly: ≥4 zero weeks signal a real gap; monthly: ≥2 months
                gap_thresh = 4 if forecast_type == "weekly" else 2
                if gap_len >= gap_thresh:
                    # Drop the gap and the isolated spike after it
                    df = df.iloc[:zero_run_start].reset_index(drop=True)
                elif last_nz < len(vals) - 1:
                    # Simple trailing zeros — trim to last non-zero
                    df = df.iloc[:last_nz + 1].reset_index(drop=True)

        n = len(df)
        if n < min_data:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough complete {forecast_type} periods ({n}). "
                       f"SSA requires at least {min_data}."
            )

        # ── SSA window length ─────────────────────────────────────────────────
        # dominant_period uses ACF; threshold 0.15 avoids weak/noise peaks.
        period = dominant_period(df["Value"].values, acf_threshold=0.15)
        if forecast_type == "weekly":
            L = (period * 2) if (period and 3 <= period <= 26) else min(26, max(2, n // 2))
        elif forecast_type == "monthly":
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        else:  # annually (monthly training series)
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        L = max(2, min(L, n // 2))

        ssa = SSA(df["Value"].values, L=L)
        threshold = 0.01

        if forecast_type == "monthly" and n < 40:
            max_comp = 2
        elif forecast_type == "annually":
            # Use more components if we have enough monthly training points (≥36 = 3 yrs)
            max_comp = 4 if n >= 36 else 2
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
        noise = df["Value"].values - trend - seasonality

        # Compute noise_std on non-zero periods only to avoid inflation from sparse gaps
        nonzero_mask = df["Value"].values > 0
        noise_std = (
            float(np.std(noise[nonzero_mask])) if nonzero_mask.sum() > 1
            else float(np.std(noise))
        )

        # ── Backtest ─────────────────────────────────────────────────────────
        if forecast_type == "weekly":
            bt_periods = min(forecast_periods, max(2, n // 5), 8)
        elif forecast_type == "monthly":
            bt_periods = min(forecast_periods, max(2, n // 5), 6)
        else:
            bt_periods = min(forecast_periods, max(1, n // 10), 3)

        accuracy = {"mape": None, "mae": None, "backtest_n": bt_periods}
        # backtest_series is returned separately so the frontend can overlay
        # backtest actuals at the correct weekly/monthly dates on the daily chart.
        backtest_series = {"dates": [], "actuals": [], "predictions": []}
        if n - bt_periods >= 10:
            try:
                train_vals = df["Value"].values[:n - bt_periods]
                bt_actuals = df["Value"].values[n - bt_periods:]
                bt_raw_dates = df["Date"].values[n - bt_periods:]

                L_bt = max(2, min(L, len(train_vals) // 2))
                ssa_bt = SSA(train_vals, L=L_bt)
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
                    pred_s   = pd.Series(bt_pred,   index=pd.to_datetime(bt_raw_dates))
                    act_agg  = act_s.resample("YS").sum()
                    pred_agg = pred_s.resample("YS").sum()
                    n_agg    = min(len(act_agg), len(pred_agg))
                    act      = act_agg.values[:n_agg]
                    pred     = pred_agg.values[:n_agg]
                    bt_display_dates = act_agg.index[:n_agg]
                else:
                    act  = bt_actuals
                    pred = bt_pred
                    bt_display_dates = pd.to_datetime(bt_raw_dates)

                nz   = act > 0
                mape = float(np.mean(np.abs((act[nz] - pred[nz]) / act[nz])) * 100) if nz.sum() > 0 else None
                mae  = float(np.mean(np.abs(act - pred)))
                accuracy = {
                    "mape":       round(mape, 2) if mape is not None else None,
                    "mae":        round(mae, 2),
                    "backtest_n": bt_periods if forecast_type != "annually" else int(n_agg),
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
                freq="W-MON"
            )
        elif forecast_type == "monthly":
            fc_dates = pd.date_range(
                start=last_date + pd.DateOffset(months=1),
                periods=forecast_periods,
                freq="MS"
            )
        else:
            monthly_steps = forecast_periods * 12
            fc_dates_monthly = pd.date_range(
                start=last_date + pd.DateOffset(months=1),
                periods=monthly_steps,
                freq="MS"
            )

        try:
            if forecast_type == "annually":
                raw_fc = ssa.forecast(components, steps=monthly_steps)
            else:
                raw_fc = ssa.forecast(components, steps=forecast_periods)
        except ValueError as lrf_err:
            raise HTTPException(status_code=400, detail="SSA forecasting failed: " + str(lrf_err))

        if forecast_type == "annually":
            fc_df_m = pd.DataFrame({"Date": fc_dates_monthly, "Value": raw_fc})
            fc_agg  = fc_df_m.set_index("Date").resample("YS").sum().head(forecast_periods).reset_index()
            out_vals  = fc_agg["Value"].values
            out_dates = fc_agg["Date"]
        else:
            out_vals  = raw_fc
            out_dates = fc_dates

        # Cap at historical distribution to prevent runaway extrapolation
        hist_vals = df["Value"].values
        hist_max  = float(hist_vals.max()) if len(hist_vals) > 0 else 1.0
        hist_mean = float(hist_vals.mean()) if len(hist_vals) > 0 else 1.0
        cap = max(hist_max * 1.5, hist_mean * 2, 1.0)
        out_vals = np.clip(out_vals, 0.0, cap)

        # Confidence interval — fixed width based on historical noise, growing with horizon
        n_out = len(out_vals)
        conf_high = [float(out_vals[i] + 1.96 * noise_std * np.sqrt(i + 1)) for i in range(n_out)]
        conf_low  = [max(0.0, float(out_vals[i] - 1.96 * noise_std * np.sqrt(i + 1))) for i in range(n_out)]

        # ── Build daily historical for chart display ─────────────────────────
        # Show every calendar day from the first sale to the last training date,
        # including zero-revenue days so the full timeline is visible on the chart.
        last_train_date = df["Date"].iloc[-1]
        all_days = pd.date_range(
            start=df_raw["Date"].min(),
            end=last_train_date,
            freq="D"
        )
        daily_rev = (
            df_raw[df_raw["Date"] <= last_train_date]
            .groupby("Date")["Value"]
            .sum()
            .reindex(all_days, fill_value=0.0)
            .reset_index()
        )
        daily_rev.columns = ["Date", "Value"]

        # Interpolate the weekly/monthly SSA components (trend, seasonality, noise)
        # to daily granularity using linear interpolation between training points.
        train_ts = df["Date"].astype(np.int64).values
        daily_ts = daily_rev["Date"].astype(np.int64).values
        trend_daily = np.interp(daily_ts, train_ts, trend)
        seas_daily  = np.interp(daily_ts, train_ts, seasonality)
        noise_daily = daily_rev["Value"].values - trend_daily - seas_daily

        # Training-period count drives data quality (not inflated by daily count)
        training_periods = len(df)
        if training_periods < 2:
            raise HTTPException(status_code=400, detail="Not enough historical data points after aggregation.")

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
            },
            "accuracy":         accuracy,
            "backtest_series":  backtest_series,
            "auto_L":           {"L_used": L, "period_detected": int(period) if period else None},
            "granularity":      "daily",
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())
