# SSA Forecast Microservice

Singular Spectrum Analysis forecasting service for PersonalizeMe Prints.

## Setup

pip install -r requirements.txt

## Run

uvicorn main:app --host 0.0.0.0 --port 8001 --reload

## Endpoint

POST /api/forecast
  - file: CSV file with Date,Value columns
  - forecast_days: integer (1-365)

## Health check

GET /health
