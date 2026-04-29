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
        df = pd.DataFrame([{"Date": r.date, "Value": r.value} for r in req.rows])
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
        df = df.dropna(subset=["Date", "Value"]).sort_values("Date").reset_index(drop=True)
        if len(df) == 0:
            raise HTTPException(status_code=400, detail="No valid data rows after parsing.")
        if forecast_type == "weekly":
            df = df.set_index("Date").resample("D").sum().reset_index()
        elif forecast_type == "monthly":
            df = df.set_index("Date").resample("W").sum().reset_index()
        elif forecast_type == "annually":
            df = df.set_index("Date").resample("MS").sum().reset_index()
        min_required = {"weekly": 30, "monthly": 16, "annually": 24}
        if len(df) < min_required[forecast_type]:
            raise HTTPException(status_code=400, detail="Not enough data after resampling.")
        n = len(df)
        period = dominant_period(df["Value"].values)
        if forecast_type == "weekly":
            L = (period * 2) if (period and 3 <= period <= 30) else min(60, max(2, n // 2))
        elif forecast_type == "monthly":
            L = (period * 2) if (period and 2 <= period <= 13) else min(13, max(2, n // 2))
        elif forecast_type == "annually":
            L = (period * 2) if (period and 2 <= period <= 6) else min(6, max(2, n // 2))
        L = max(2, min(L, n // 2))
        ssa = SSA(df["Value"].values, L=L)
        threshold = 0.01
        # Limit candidate components based on data density to reduce LRF instability.
        # Monthly/annual series are resampled to coarser granularity, so fewer
        # components are reliable when the aggregated series is short.
        if forecast_type == "monthly" and n < 40:
            max_comp = 2
        elif forecast_type == "annually":
            max_comp = 2
        else:
            max_comp = 4
        components = [c for c in range(max_comp + 1) if c < len(ssa.Sigma) and ssa.Sigma[c] / ssa.Sigma[0] >= threshold]
        if 0 not in components:
            components = [0] + components
        trend = ssa.reconstruct(0)
        seasonal_c = [c for c in components if c > 0]
        seasonality = ssa.reconstruct(seasonal_c) if seasonal_c else np.zeros(n)
        noise = df["Value"].values - trend - seasonality
        hist_df = pd.DataFrame({
            "Date": df["Date"],
            "Value": df["Value"].replace([np.inf, -np.inf], np.nan).fillna(0),
            "Trend": trend,
            "Seasonality": seasonality,
            "Noise": noise,
        }).set_index("Date")
        nonzero_mask = df["Value"].values > 0
        noise_std = float(np.std(noise[nonzero_mask])) if nonzero_mask.sum() > 1 else float(np.std(noise))

        # --- Backtest at the AGGREGATED display level ---
        # Previous bug: backtest was on raw granular points (daily/weekly) while the
        # displayed forecast is weekly/monthly/annual aggregates — completely different scales.
        # Fix: hold out N aggregated periods, aggregate both actuals and forecasts,
        # then compute accuracy on the same level the user sees.
        if forecast_type == "weekly":
            bt_periods   = min(forecast_periods, max(2, n // 35), 8)   # weeks to hold out
            bt_raw_steps = bt_periods * 7                               # days
            bt_agg_rule  = "W-MON"
        elif forecast_type == "monthly":
            bt_periods   = min(forecast_periods, max(2, n // 20), 6)   # months to hold out
            bt_raw_steps = bt_periods * 4                               # weeks
            bt_agg_rule  = "MS"
        else:
            bt_periods   = min(forecast_periods, max(1, n // 60), 3)   # years to hold out
            bt_raw_steps = max(bt_periods * 12, 1)                      # months
            bt_agg_rule  = "YS"

        if n - bt_raw_steps < 10:
            bt_raw_steps = max(n - 10, 1)

        bt_actual_vals  = df["Value"].values[-bt_raw_steps:]
        bt_actual_dates = pd.to_datetime(df["Date"].values[-bt_raw_steps:])
        train_vals      = df["Value"].values[:n - bt_raw_steps]

        accuracy = {"mape": None, "mae": None, "backtest_n": bt_periods}
        try:
            if len(train_vals) >= 10:
                L_bt     = max(2, min(L, len(train_vals) // 2))
                ssa_bt   = SSA(train_vals, L=L_bt)
                comps_bt = [c for c in range(max_comp + 1) if c < len(ssa_bt.Sigma) and ssa_bt.Sigma[c] / ssa_bt.Sigma[0] >= threshold]
                if 0 not in comps_bt:
                    comps_bt = [0] + comps_bt
                bt_raw_fc = ssa_bt.forecast(comps_bt, steps=bt_raw_steps)
                bt_raw_fc = np.clip(bt_raw_fc, 0.0, float(train_vals.max()) * 3)

                # Aggregate both actuals and forecast to the display period using the
                # same date labels from the resampled df (guarantees alignment).
                act_df  = pd.DataFrame({"Date": bt_actual_dates, "Value": bt_actual_vals})
                pred_df = pd.DataFrame({"Date": bt_actual_dates, "Value": bt_raw_fc})
                act_agg  = act_df.set_index("Date").resample(bt_agg_rule).sum()["Value"].values
                pred_agg = pred_df.set_index("Date").resample(bt_agg_rule).sum()["Value"].values

                n_agg = min(len(act_agg), len(pred_agg))
                act   = act_agg[:n_agg]
                pred  = pred_agg[:n_agg]

                # MAPE on non-zero actuals only (zero-sales periods are undefined for MAPE).
                # At weekly/monthly/annual aggregation, near-zero periods are rare so this
                # gives a clean, standard accuracy number.
                nz   = act > 0
                mape = float(np.mean(np.abs((act[nz] - pred[nz]) / act[nz])) * 100) if nz.sum() > 0 else None
                mae  = float(np.mean(np.abs(act - pred)))
                accuracy = {
                    "mape":       round(mape, 2) if mape is not None else None,
                    "mae":        round(mae, 2),
                    "backtest_n": int(n_agg),
                }
        except Exception:
            pass
        last_date = df["Date"].iloc[-1]
        if forecast_type == "weekly":
            steps = forecast_periods * 7
            agg_rule = "W-MON"
            ci_scale = np.sqrt(7.0)
            fc_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=steps, freq="D")
        elif forecast_type == "monthly":
            steps = forecast_periods * 6
            agg_rule = "MS"
            ci_scale = np.sqrt(4.33)
            fc_dates = pd.date_range(start=last_date + pd.Timedelta(weeks=1), periods=steps, freq="W")
        elif forecast_type == "annually":
            steps = forecast_periods * 12
            agg_rule = "YS"
            ci_scale = np.sqrt(12.0)
            fc_dates = pd.date_range(start=last_date + pd.DateOffset(months=1), periods=steps, freq="MS")
        hist_agg = hist_df.resample(agg_rule).sum().reset_index()
        if len(hist_agg) < 2:
            raise HTTPException(status_code=400, detail="Not enough historical data points after aggregation.")
        try:
            forecast_vals = ssa.forecast(components, steps=steps)
        except ValueError as lrf_err:
            raise HTTPException(status_code=400, detail="SSA forecasting failed: " + str(lrf_err))
        fc_df = pd.DataFrame({"Date": fc_dates, "Value": forecast_vals})
        agg_df = fc_df.set_index("Date").resample(agg_rule).sum().reset_index()
        agg_df = agg_df.head(forecast_periods)
        out_vals = agg_df["Value"].values
        hist_agg_vals = hist_agg["Value"].values
        hist_agg_max = float(hist_agg_vals.max()) if len(hist_agg_vals) > 0 else 1.0
        hist_agg_mean = float(hist_agg_vals.mean()) if len(hist_agg_vals) > 0 else 1.0
        cap = max(hist_agg_max * 1.5, hist_agg_mean * 2, 1.0)
        out_vals = np.clip(out_vals, 0.0, cap)
        base_margin = 1.96 * noise_std * ci_scale
        n_out = len(out_vals)
        conf_high = [float(out_vals[i] + base_margin * np.sqrt(i + 1)) for i in range(n_out)]
        conf_low = [max(0.0, float(out_vals[i] - base_margin * np.sqrt(i + 1))) for i in range(n_out)]
        return {
            "historical": {
                "dates": hist_agg["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "values": hist_agg["Value"].tolist(),
                "trend": hist_agg["Trend"].tolist(),
                "seasonality": hist_agg["Seasonality"].tolist(),
                "noise": hist_agg["Noise"].tolist(),
            },
            "forecast": {
                "dates": agg_df["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "values": out_vals.tolist(),
                "confidence_high": conf_high,
                "confidence_low": conf_low,
            },
            "data_quality": {"hist_agg_count": len(hist_agg), "is_low_confidence": len(hist_agg) < 5},
            "accuracy": accuracy,
            "auto_L": {"L_used": L, "period_detected": int(period) if period else None},
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())
