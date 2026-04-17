from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pandas as pd
import numpy as np
from ssa import SSA

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
    forecast_type: str  # 'weekly' | 'monthly' | 'annually'


@app.post("/api/forecast")
async def forecast(req: ForecastRequest):
    try:
        forecast_type = req.forecast_type
        forecast_periods = req.forecast_periods

        if forecast_type not in ("weekly", "monthly", "annually"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid forecast_type '{forecast_type}'. Must be weekly, monthly, or annually.",
            )

        # Build DataFrame
        df = pd.DataFrame([{"Date": r.date, "Value": r.value} for r in req.rows])
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
        df = df.dropna(subset=["Date", "Value"])
        df = df.sort_values("Date").reset_index(drop=True)

        if len(df) == 0:
            raise HTTPException(status_code=400, detail="No valid data rows after parsing.")

        # Resample based on period type
        # Weekly  → each point = 1 day   (W-SUN bins)
        # Monthly → each point = 1 week  (W-SUN bins, labeled as weeks)
        # Annually→ each point = 1 month (MS bins)
        if forecast_type == "weekly":
            df = df.set_index("Date").resample("W").sum().reset_index()
        elif forecast_type == "monthly":
            df = df.set_index("Date").resample("W").sum().reset_index()
        elif forecast_type == "annually":
            df = df.set_index("Date").resample("MS").sum().reset_index()

        if len(df) < 10:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data points after resampling ({len(df)}). Need at least 10.",
            )

        n = len(df)

        # L selection per period type
        if forecast_type == "weekly":
            L = min(26, max(2, n // 2))
        elif forecast_type == "monthly":
            L = min(13, max(2, n // 2))
        elif forecast_type == "annually":
            L = min(6, max(2, n // 2))

        # Components: trend (0) + first two seasonal pairs (1,2,3,4)
        components = [0, 1, 2, 3, 4]
        # Clamp to available singular values (determined after SSA init)
        ssa = SSA(df["Value"].values, L=L)
        max_comp = len(ssa.Sigma)
        components = [c for c in components if c < max_comp]

        # Decompose
        trend = ssa.reconstruct(0)
        seasonal_c = [c for c in components if c > 0]
        seasonality = ssa.reconstruct(seasonal_c) if seasonal_c else np.zeros(n)
        noise = df["Value"].values - trend - seasonality

        # Forecast
        forecast_vals = ssa.forecast(components, steps=forecast_periods)

        # Confidence interval: ±1.96 * std(noise)
        noise_std = float(np.std(noise))
        margin = 1.96 * noise_std
        conf_high = (forecast_vals + margin).tolist()
        conf_low = (forecast_vals - margin).tolist()

        # Future dates
        last_date = df["Date"].iloc[-1]
        if forecast_type == "weekly":
            forecast_dates = [last_date + pd.DateOffset(weeks=i) for i in range(1, forecast_periods + 1)]
        elif forecast_type == "monthly":
            forecast_dates = [last_date + pd.DateOffset(weeks=i) for i in range(1, forecast_periods + 1)]
        elif forecast_type == "annually":
            forecast_dates = [last_date + pd.DateOffset(months=i) for i in range(1, forecast_periods + 1)]

        # Clean historical values
        hist_values = df["Value"].replace([np.inf, -np.inf], np.nan).fillna(0).tolist()

        return {
            "historical": {
                "dates": df["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "values": hist_values,
                "trend": trend.tolist(),
                "seasonality": seasonality.tolist(),
                "noise": noise.tolist(),
            },
            "forecast": {
                "dates": [d.strftime("%Y-%m-%d") for d in forecast_dates],
                "values": forecast_vals.tolist(),
                "confidence_high": conf_high,
                "confidence_low": conf_low,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"{str(e)}\n{traceback.format_exc()}")
