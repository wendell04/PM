# ARIMA & Prophet Benchmark (fully isolated)

A **standalone** tool that runs **ARIMA and Prophet** on your real data so you can
compare their accuracy against your existing **SSA**. It is completely separate from
`ssa-service/`, `backend/`, and `frontend/` — **nothing in your app or your SSA
service is touched.** SSA stays only in your live system.

## The two models — each its own independent library
- **ARIMA** — `pmdarima` (standalone `auto_arima`)
- **Prophet** — Facebook's `prophet`

They are evaluated on an **identical rolling-origin backtest** and scored with
**MASE** (scale-free, vs the naïve baseline — lower is better, <1 beats naïve),
plus RMSE / MAE / sMAPE. Use these numbers next to your SSA dashboard's accuracy
to build the comparison.

## Run it
```bash
cd forecast-benchmark
venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002
```
Then open **http://localhost:8002**.

## Use it
1. Paste your **Laravel API URL** (`http://127.0.0.1:8000`) and a **bearer token**
   from your logged-in admin session (DevTools → Network → any `/api/admin/...`
   request → copy the `Authorization: Bearer …` value).
2. Pick a **series** (Sales Revenue / Sales Quantity / Inventory Demand), **period**,
   and **horizon**, then **Run Benchmark**.
3. The service fetches your data **server-side** with that token, aggregates it,
   runs ARIMA and Prophet, and shows the metrics table + forecast overlay.

The token lives only in your browser's local storage; the service never persists it
and never writes to your database.

## API
- `POST /api/benchmark-live` — `{api_url, token, series, inventory_id, forecast_type, forecast_periods}`
- `POST /api/benchmark` — `{rows:[{date,value}], forecast_type, forecast_periods}`
- `POST /api/inventory-list` — `{api_url, token}` → items for the dropdown
- `GET /health` — liveness + model list
