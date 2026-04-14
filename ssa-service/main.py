from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io
import datetime
from ssa import SSA

app = FastAPI()

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/columns")
async def get_columns(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents), nrows=5)
        elif file.filename.endswith(('.xlsx', '.xls')):
            try:
                df = pd.read_excel(io.BytesIO(contents), nrows=5)
            except:
                df = pd.read_excel(io.BytesIO(contents), header=None, nrows=5)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format.")
        
        columns = list(df.columns)
        if len(columns) > 1:
            return {"columns": [str(c) for c in columns[1:]]}
        else:
            return {"columns": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/forecast")
async def forecast(file: UploadFile = File(...), forecast_periods: int = Form(...), forecast_type: str = Form("daily"), forecast_day_of_week: str = Form(None), target_column: str = Form(None)):
    try:
        contents = await file.read()
        
        # Determine file type and read into pandas
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
            if len(df.columns) < 2:
                raise Exception("File must have at least two columns.")
            # Standardize columns
            if target_column and target_column in df.columns:
                date_col = df.columns[0]
                df = df[[date_col, target_column]]
            else:
                df = df.iloc[:, :2]
            df.columns = ['Date', 'Value']
        elif file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
            try:
                df = pd.read_excel(io.BytesIO(contents))
                if len(df.columns) < 2:
                    raise Exception("File must have at least two columns.")
                
                if target_column and target_column in df.columns:
                    date_col = df.columns[0]
                    df = df[[date_col, target_column]]
                else:
                    df = df.iloc[:, :2]
                df.columns = ['Date', 'Value']
            except Exception as read_ex:
                # Fallback to no header
                df = pd.read_excel(io.BytesIO(contents), header=None)
                df = df.iloc[:, :2]
                df.columns = ['Date', 'Value']
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a CSV or Excel file.")

        # Convert date to datetime, handle errors
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
        # Drop rows with invalid dates or missing values
        df = df.dropna(subset=['Date', 'Value'])
        df = df.sort_values('Date').reset_index(drop=True)
        
        if forecast_type == 'monthly':
            df = df.set_index('Date').resample('ME').sum().reset_index()
        elif forecast_type == 'weekly':
            df = df.set_index('Date').resample('W').sum().reset_index()
        elif forecast_type == 'day_of_week':
            if forecast_day_of_week:
                df = df[df['Date'].dt.day_name() == forecast_day_of_week].reset_index(drop=True)
            else:
                df = df[df['Date'].dt.day_name() == 'Monday'].reset_index(drop=True)
        
        if len(df) < 10:
            raise HTTPException(status_code=400, detail="Not enough data points for SSA.")

        # Determine L and components based on data length and type.
        L = 30
        components = [0, 1, 2, 3]
        
        if forecast_type == 'monthly':
            L = min(12, max(2, len(df) // 2))
            components = [0, 1] if L < 6 else [0, 1, 2]
        elif forecast_type in ['weekly', 'day_of_week']:
            L = min(13, max(2, len(df) // 2))
            components = [0]
        else:
            if len(df) < 60:
                L = max(2, len(df) // 2)

        # Initialize SSA
        ssa = SSA(df['Value'].values, L=L)

        # Extract components
        trend = ssa.reconstruct(0)
        
        seasonality_comps = [c for c in components if c > 0]
        if seasonality_comps:
            seasonality = ssa.reconstruct(seasonality_comps)
        else:
            seasonality = np.zeros(len(df))
            
        noise = df['Value'] - trend - seasonality
        
        # Forecast
        forecast_vals = ssa.forecast(components, steps=forecast_periods)
        
        # Generate future dates
        last_date = df['Date'].iloc[-1]
        
        if forecast_type == 'monthly':
            # Use pd.DateOffset to add months
            forecast_dates = [last_date + pd.DateOffset(months=i) for i in range(1, forecast_periods + 1)]
        elif forecast_type in ['weekly', 'day_of_week']:
            # Use pd.DateOffset to add weeks
            forecast_dates = [last_date + pd.DateOffset(weeks=i) for i in range(1, forecast_periods + 1)]
        else:
            # Try to infer frequency, fallback to 1 day
            try:
                freq = df['Date'].diff().median()
                if pd.isna(freq):
                    freq = pd.Timedelta(days=1)
            except:
                freq = pd.Timedelta(days=1)
                
            forecast_dates = [last_date + freq * i for i in range(1, forecast_periods + 1)]

        # Prepare response
        # We need to send back dates as strings
        # Also handle any NaN or infinite values
        df['Value'] = df['Value'].replace([np.inf, -np.inf], np.nan).fillna(0)
        
        historical_data = {
            "dates": df['Date'].dt.strftime('%Y-%m-%d').tolist(),
            "values": df['Value'].tolist(),
            "trend": trend.tolist(),
            "seasonality": seasonality.tolist(),
            "noise": noise.tolist()
        }
        
        forecast_data = {
            "dates": [d.strftime('%Y-%m-%d') for d in forecast_dates],
            "values": forecast_vals.tolist()
        }

        return {
            "historical": historical_data,
            "forecast": forecast_data
        }

    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"{str(e)}\nTraceback: {tb_str}")
