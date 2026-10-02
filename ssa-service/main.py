import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging

import pandas as pd
import numpy as np
from ssa import SSA, dominant_period

logger = logging.getLogger("ssa-service")

app = FastAPI()

# The dashboard calls this service directly from the browser, so it needs CORS -
# but only from the dashboard.
#
# The default here MUST include the deployed dashboard, not just localhost. An
# earlier version of this defaulted to localhost only, which was correct on a
# dev machine and silently cut the live dashboard off from its own forecast
# service the moment it deployed: every tab showed "could not reach", because a
# blocked preflight and a dead host look identical to fetch().
#
# These mirror backend/config/cors.php, which is where the dashboard's real
# origins are already written down - they are not guesses. Override the whole
# list with SSA_ALLOWED_ORIGINS (comma separated) when a new host appears.
#
# "*" is still not an option: it was paired with allow_credentials=True, and no
# browser accepts a wildcard origin on a credentialed request.
_origins_env = os.getenv("SSA_ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://personalizemeprints.com",
        "https://www.personalizemeprints.com",
    ]
)

# Cloudflare Pages preview deployments, matching the same carve-out Laravel
# makes: allowed outside production only, because anyone can host on
# *.pages.dev and these responses are credentialed.
_preview_regex = (
    None if os.getenv("APP_ENV", "").lower() == "production"
    # A Pages deployment URL is <commit-or-branch>.<project>.pages.dev - two
    # labels, not one. Matching a single label allowed only the bare project
    # alias, so every preview and branch deployment was refused at preflight
    # and the browser reported a plain "Failed to fetch".
    else r"https://([A-Za-z0-9-]+\.)*[A-Za-z0-9-]+\.pages\.dev"
)

logger.info("CORS allows: %s%s", ", ".join(ALLOWED_ORIGINS),
            "  (+ *.pages.dev previews)" if _preview_regex else "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_preview_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    # "ngrok-skip-browser-warning" is sent by several dashboard fetches (see the
    # same list in backend/config/cors.php). A custom header that is not listed
    # here makes Starlette answer the preflight with 400, which the browser
    # reports as "Failed to fetch" - so it is listed rather than left to bite.
    allow_headers=["Content-Type", "Authorization", "Accept", "ngrok-skip-browser-warning"],
)

# ── The shop's clock ─────────────────────────────────────────────────────────
# Every "now" in this service used to be a bare pd.Timestamp.now(), which is the
# HOST's local time. The backend declares 'timezone' => 'Asia/Manila'
# (backend/config/app.php), the dashboard buckets sales on that same clock
# (frontend/lib/businessDate.js), and incoming Mongo dates are normalised to UTC
# further down - so "now" was the one thing in the pipeline reading a different
# calendar from the data it was compared against.
#
# It never showed here, because this machine is on Manila time. The service has
# no deployment config yet (see the note in frontend/.env.production), and the
# day it gets one on an ordinary UTC host this would have shifted "last complete
# month" back by one, moved the weekly forecast start and gap_offset by a week,
# and put stockout_date a day out - for the eight hours a day the UTC date lags
# Manila's. Setting TZ on the host would fix it too, but silently and only until
# someone forgets; naming the zone here means the service cannot be deployed
# wrong.
BUSINESS_TZ = os.getenv("SSA_BUSINESS_TZ", "Asia/Manila")


def business_now() -> pd.Timestamp:
    """Now, on the shop's clock, tz-naive.

    Naive on purpose: the period labels and date columns this is compared
    against are tz-naive, and mixing the two raises in pandas.
    """
    return pd.Timestamp.now(tz=BUSINESS_TZ).tz_localize(None)


class DataRow(BaseModel):
    date: str
    value: float

class ForecastRequest(BaseModel):
    rows: List[DataRow]
    forecast_periods: int
    forecast_type: str
    data_type: str = "sales"  # "sales" | "stock" | "demand"


class SaleRow(BaseModel):
    customerEmail: str
    totalPrice: float
    # Optional[str], not str: the handler coerces a null date to NaT and drops the
    # row, but a bare `str = None` types the field as str, so Pydantic refused the
    # null before that code ever ran and the caller got a 422 instead.
    saleDate: Optional[str] = None
    orderKey: Optional[str] = None   # distinct-order id so Frequency counts orders, not line items

class RFMRequest(BaseModel):
    sales: List[SaleRow]
    reference_date: Optional[str] = None

class ServiceRow(BaseModel):
    productName: str
    totalPrice: float
    quantity: int = 1
    saleDate: Optional[str] = None

class ServiceSegmentRequest(BaseModel):
    sales: List[ServiceRow]

class ComparativePeriod(BaseModel):
    period: str
    actual: float
    # Same trap: /api/comparative filters out periods with no forecast, which
    # means it expects nulls - but `float = None` rejected them at the door.
    forecast: Optional[float] = None

class ComparativeRequest(BaseModel):
    series: List[ComparativePeriod]
    threshold_pct: float = 20.0


def _server_error(where: str, e: Exception) -> HTTPException:
    """Log the detail, return a message that gives nothing away.

    Every endpoint used to put str(e) plus the full traceback in the HTTP
    detail, so a failure handed the browser the stack and the absolute
    paths of this machine. The forecast page shows response detail to the
    user, so that reached the screen too.
    """
    logger.exception("%s failed", where)
    return HTTPException(status_code=500, detail=f"{where} failed. See the service log for details.")


# ── MAPE: computed only on weeks with actual sales ───────────────────────────
# Zero-actual weeks are excluded so we only measure accuracy on real sale events.
# Returns None when all backtest actuals are zero (mae_ratio fallback used instead).
def compute_mape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    mask = actual > 0
    if mask.sum() == 0:
        return None
    errors = np.abs((actual[mask] - predicted[mask]) / actual[mask])
    return float(np.mean(errors) * 100)


def demand_profile(series: np.ndarray):
    """Classify a per-period demand series (Syntetos–Boylan).
    Returns (cls, adi, cv2) where cls ∈ {steady, variable, intermittent, lumpy, new}.
    ADI = average inter-demand interval; cv2 = squared CV of non-zero demand sizes."""
    s = np.asarray(series, dtype=float)
    nz = s[s > 0]
    n = len(s)
    if len(nz) == 0 or n < 3:
        return "new", float("inf"), 0.0
    adi = n / len(nz)
    mean_nz = float(np.mean(nz))
    cv2 = float((np.std(nz, ddof=1) / mean_nz) ** 2) if len(nz) > 1 and mean_nz > 0 else 0.0
    if adi <= 1.32 and cv2 <= 0.49:   cls = "steady"
    elif adi > 1.32 and cv2 <= 0.49:  cls = "intermittent"
    elif adi <= 1.32 and cv2 > 0.49:  cls = "variable"
    else:                             cls = "lumpy"
    return cls, adi, cv2


def croston_sba(series: np.ndarray, alpha: float = 0.1, sba: bool = True) -> float:
    """Croston's method (SBA-corrected) for intermittent demand.
    Smooths demand SIZE and inter-demand INTERVAL separately and returns a single
    per-period demand RATE — the honest output for sparse series (a flat estimate,
    not a spurious wiggly curve). SBA applies the (1 - alpha/2) bias correction."""
    s = np.asarray(series, dtype=float)
    nz_idx = np.where(s > 0)[0]
    if len(nz_idx) == 0:
        return 0.0
    z = float(s[nz_idx[0]])              # smoothed demand size
    p = float(nz_idx[0] + 1)             # smoothed interval (gap to first demand)
    q = 1                                # periods since last demand
    for t in range(nz_idx[0] + 1, len(s)):
        if s[t] > 0:
            z += alpha * (s[t] - z)
            p += alpha * (q - p)
            q = 1
        else:
            q += 1
    if p <= 0:
        return 0.0
    rate = z / p
    if sba:
        rate *= (1.0 - alpha / 2.0)
    return float(max(0.0, rate))


def apply_forecast_post(raw, hist, dates, forecast_type, is_sparse):
    """Everything that happens between raw SSA output and what the chart shows.

    Extracted so the BACKTEST can apply it too. Until it did, accuracy was scored
    on raw SSA while the dashboard displayed a Croston rate, or a dampened and
    floored curve - two different forecasts reported under one number. On the live
    revenue series the backtest sat at a flat ~5,516 while the chart showed
    [2828, 5103, 3929, 6023].

    hist must be the UNFLOORED history for the same window the forecast came from.
    Returns (values, method, dampened).
    """
    out  = np.asarray(raw,  dtype=float)
    hist = np.asarray(hist, dtype=float)
    if hist.size == 0:
        return out, "ssa", False

    annual = (forecast_type == "annually" and dates is not None and len(dates) == len(hist))

    if annual:
        _sums = pd.Series(hist, index=pd.to_datetime(dates)).resample("YS").sum().values
        hist_max  = float(_sums.max())  if len(_sums) else 1.0
        hist_mean = float(_sums.mean()) if len(_sums) else 1.0
    else:
        hist_max, hist_mean = float(hist.max()), float(hist.mean())
    cap = max(hist_max * 1.5, hist_mean * 2, 1.0)
    out = np.clip(out, 0.0, cap)

    cls, _, _ = demand_profile(hist)
    if is_sparse and forecast_type in ("weekly", "monthly") and cls in ("intermittent", "lumpy", "new"):
        rate = croston_sba(hist, alpha=0.1, sba=True)
        return np.clip(np.full(out.size, rate, dtype=float), 0.0, cap), "sba", False

    dampened = False
    if not is_sparse:
        if annual:
            _s    = pd.Series(hist, index=pd.to_datetime(dates))
            _sum  = _s.resample("YS").sum()
            _full = _sum[_s.resample("YS").count() >= 12]
            _h    = _full.values if len(_full) > 0 else _sum.values
            _w    = min(3, len(_h))
            recent_mean = float(_h[-_w:].mean()) if _w > 0 else 0.0
        else:
            _sl = hist[-min(8, hist.size):]
            _nz = _sl[_sl > 0]
            recent_mean = float(_nz.mean()) if _nz.size > 0 else float(_sl.mean())
        fmean = float(out.mean())
        if recent_mean > 0 and fmean > recent_mean * 1.5:
            out = out * ((recent_mean * 1.5) / fmean)
            dampened = True

        if forecast_type in ("weekly", "monthly"):
            _nzr = hist[-26:] if forecast_type == "weekly" else hist[-12:]
            _nzr = _nzr[_nzr > 0]
            if _nzr.size > 0:
                _floor = float(_nzr.mean()) * 0.6
                _rng   = float(out.max() - out.min())
                _shaped = (_floor * (0.8 + ((out - out.min()) / _rng) * 0.4)) if _rng > 0                           else np.full_like(out, _floor)
                out = np.maximum(out, _shaped)
    return out, "ssa", dampened


def _compute_last_period_value(
    original_values: np.ndarray,
    dates: "pd.Series",
    forecast_type: str,
) -> float:
    """Return the most meaningful 'last period' revenue value for display.

    ONLY THE ANNUAL BRANCH IS REACHED. The single caller passes the literal
    "annually"; weekly and monthly take a trailing 7- and 30-day total anchored
    to the most recent sale instead, computed at the call site, and the card
    that shows it is labelled "Last 7-Day Revenue" to match. The branches below
    for those two are dead - kept because they implement a different and
    defensible definition ("last complete W-MON bucket", "last complete
    calendar month") should the display ever want it, but do not read them as
    describing what the dashboard currently shows.
    """
    dates_dt = pd.to_datetime(dates)
    now = business_now()

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
        # Three shapes of series, two independent behaviours.
        #
        #   sales   dense money/units per day; trailing zeros trimmed, zero days
        #           floored so SSA has signal, dampening applied
        #   stock   a level that holds until the next movement; forward-filled
        #           for display, and the headline figure is the latest level
        #   demand  units consumed per period. Sparse like stock - zeros are
        #           real and must not be floored away - but it is a flow, not a
        #           level, so it sums for display and its headline figure is the
        #           last complete period, exactly like sales.
        #
        # Before this, the page sent a demand series as "stock", so the history
        # line was forward-filled and the headline figure was the last raw row:
        # level semantics on a flow.
        is_stock         = (req.data_type == "stock")
        is_demand        = (req.data_type == "demand")
        is_sparse        = is_stock or is_demand   # zeros are real; route intermittent to SBA
        if forecast_type not in ("weekly", "monthly", "annually"):
            raise HTTPException(status_code=400, detail="Invalid forecast_type.")

        # Nothing to build from. Checked before the DataFrame, because an empty
        # one has no columns at all and the first ["Date"] raises a KeyError -
        # which surfaced as a 500 rather than the 400 this is.
        if not req.rows:
            raise HTTPException(status_code=400, detail="No data rows provided.")

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
            min_data  = 4 if is_sparse else 10
        elif forecast_type == "monthly":
            agg_rule = "MS"
            min_data  = 3 if is_sparse else 10
        else:   # annually — train on monthly, aggregate to years
            agg_rule = "MS"
            min_data  = 12 if is_sparse else 24   # 1 year of monthly for stock

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
        if not is_sparse and len(df) > 0:
            vals   = df["Value"].values
            nz_pos = np.where(vals > 0)[0]
            if len(nz_pos) > 0:
                last_nz = int(nz_pos[-1])
                if last_nz < len(vals) - 1:
                    df = df.iloc[:last_nz + 1].reset_index(drop=True)

        # ── Floor zero periods for SSA training stability (sales only) ───────
        # Zero/near-zero periods use peak/4 as a reasonable baseline instead
        # of leaving them at zero (which destabilises SSA) or using tiny noise
        # (which is too close to zero to matter). peak/4 keeps the series
        # readable and gives SSA enough signal without inflating the trend.
        original_values = df["Value"].values.copy()
        if not is_sparse:
            _nz_pre = original_values[original_values > 0]
            if len(_nz_pre) > 0:
                _peak      = float(np.max(_nz_pre))
                _floor_val = _peak / 4.0
                _zero_mask = original_values == 0
                if _zero_mask.any():
                    df = df.copy()
                    df.loc[_zero_mask, "Value"] = _floor_val

        n = len(df)
        if n < min_data:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Not enough complete {forecast_type} periods ({n}). "
                    f"SSA requires at least {min_data}."
                    + (" Try switching to Monthly period." if is_sparse and forecast_type == "weekly" else "")
                )
            )

        # ── Dynamic safe forecast horizon (N // 2 rule) ───────────────────────
        if forecast_type == "weekly":
            safe_max = min(n // 2, 52)
        elif forecast_type == "monthly":
            safe_max = min(n // 2, 12)
        else:
            safe_max = min(10, max(3, n // 4))

        # Tie the offer to the evidence. N/2 alone let the service offer 52 weekly
        # periods validated on 8, and 10 annual periods validated on 2. Two times
        # the backtest window is the most that can be defended from it.
        if forecast_type == "weekly":
            _bt_est = min(max(4, n // 5), 8)
        elif forecast_type == "monthly":
            _bt_est = min(max(3, n // 5), 6)
        else:
            _bt_est = max(1, min(12, n - 10))
        safe_max = min(safe_max, _bt_est * 2)
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
        # On the unfloored series: zeros are replaced by peak/4 before SSA runs, and
        # differencing that substitution creates short-lag correlation that is an
        # artefact of the floor. It returned period=2 on the live weekly data.
        period = dominant_period(original_values, acf_threshold=0.15)
        if forecast_type == "weekly":
            L = (period * 2) if (period and 3 <= period <= 26) else min(26, max(2, n // 2))
        elif forecast_type == "monthly":
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        else:
            L = (period * 2) if (period and 2 <= period <= 6)  else min(13, max(2, n // 2))
        L = max(2, min(L, n // 2))

        ssa       = SSA(df["Value"].values, L=L)
        threshold = 0.01

        # ── Sparsity-aware component count ────────────────────────────────────
        # With dense data five components capture trend plus two seasonal
        # harmonic pairs. With sparse (mostly-zero) data the higher ones fit
        # spike noise as though it were seasonality and project it forward,
        # inflating the forecast - so the count comes down with the non-zero
        # ratio and the model stays conservative on intermittent demand.
        # Sparsity and volatility computed on real (unfloored) values
        nonzero_ratio = float(np.sum(original_values > 0) / len(original_values))

        # ── CV / volatility detection ─────────────────────────────────────────
        # Coefficient of Variation on non-zero weeks measures demand volatility.
        # CV > 1.5 = highly erratic spike demand; model tracks trend, not timing.
        # trend_avg is exposed as the "baseline demand level" for the frontend.
        _nz_vals = original_values[original_values > 0]
        cv = float(np.std(_nz_vals) / np.mean(_nz_vals)) if len(_nz_vals) > 1 else 0.0
        is_high_volatility = cv > 1.5

        # max_comp is the highest component INDEX kept, so the count below is
        # max_comp + 1. The comments here used to name the count and were each
        # one short: max_comp = 1 is trend plus one harmonic, not "only trend".
        if forecast_type == "monthly" and n < 40:
            max_comp = 2                      # 3 components
        elif forecast_type == "annually":
            max_comp = 4 if n >= 36 else 2    # 5 with 3 years of months, else 3
        elif nonzero_ratio < 0.30:
            # Very sparse weekly: trend plus a single harmonic. Anything beyond
            # that fits the gaps between spikes and projects them as season.
            max_comp = 1                      # 2 components
        elif nonzero_ratio < 0.60:
            # Moderately sparse: trend plus two.
            max_comp = 2                      # 3 components
        else:
            max_comp = 4                      # 5 components: trend + 2 harmonic pairs

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
            bt_periods = min(max(4, n // 5), 8)    # fixed window, independent of forecast_periods
        elif forecast_type == "monthly":
            bt_periods = min(max(3, n // 5), 6)    # fixed window, independent of forecast_periods
        else:  # annually — 12 monthly periods = 1 full calendar year for backtest
            bt_periods = max(1, min(12, n - 10))

        # ── Backtest window ──────────────────────────────────────────────────
        # For sparse data the tail window is often all zeros, which leaves MAPE
        # undefined, so this may slide the window back to find periods it can
        # actually score. Sliding has a cost, and it used to be unbounded: the
        # floor was 10 training rows, so on a 197-week series the window could
        # land at row 16 and the figure on screen would describe a model trained
        # on 16 periods while the forecast beside it was trained on 190. That is
        # the same fault as scoring raw SSA against a dampened chart - an
        # accuracy for a model nobody is looking at - reached a different way.
        #
        # Measured on this function before the bound: with three-quarters of
        # weeks quiet it kept the most recent window in only 18 of 200 runs and
        # slid back 28 weeks on average. Dense revenue never triggered it.
        #
        # The window may now slide by at most its own length, so the backtest
        # stays recent and its training set stays within one window of the real
        # model's. When that is not enough to find a scoreable window the
        # all-zero path is the honest answer, and the page already labels it
        # ("backtest weeks had no sales - using MAE ratio").
        def find_best_bt_start(values, bt_p, min_train=10):
            n_vals     = len(values)
            best_start = n_vals - bt_p
            best_nz    = int(np.sum(values[best_start:] > 0))
            floor      = max(min_train, n_vals - 2 * bt_p)
            for start in range(n_vals - bt_p, floor - 1, -1):
                nz = int(np.sum(values[start:start + bt_p] > 0))
                if nz > best_nz:
                    best_nz    = nz
                    best_start = start
                if best_nz >= bt_p // 2:
                    break
            return best_start, best_nz

        # Same shape as the scored dict below, so a caller never has to tell a
        # missing key from a real None. Everything here means "not measured".
        accuracy        = {"mape": None, "mae": None, "backtest_n": bt_periods,
                           "mape_scored": 0, "mape_total": 0, "mase": None, "rmse": None, "anomaly": None,
                           "training_gap": 0, "mape_reliable": False,
                           "backtest_from": None, "backtest_to": None,
                           "backtest_train_n": 0, "backtest_is_recent": None}
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
                # The same transforms the live forecast gets. Without them the
                # accuracy scored raw SSA while the chart showed a Croston rate or
                # a dampened, floored curve - one number describing a forecast the
                # dashboard never displays. History is the unfloored training slice,
                # so the recent means and demand class match that window.
                bt_pred, _, _ = apply_forecast_post(
                    bt_pred, original_values[:bt_start], df["Date"].values[:bt_start],
                    forecast_type, is_sparse,
                )

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
                # RMSE alongside MAE: the manuscript names both, and it costs one line.
                # It punishes a single large miss harder than MAE does, which on a
                # spike-driven series is the difference worth seeing.
                rmse_val = float(np.sqrt(np.mean((act - pred) ** 2)))

                # Unusual period: the most recent scored period judged against how
                # far this model normally misses. The backtest is already a
                # forecast-versus-actual comparison, so the last point in it is the
                # freshest answer to "did the shop behave the way we expected?".
                # Three times the window's own mean error is the line - a quiet
                # month and a spike month both trip it, which is the point.
                anomaly = None
                if len(act) >= 3 and mae_val > 0:
                    _last_err = float(abs(act[-1] - pred[-1]))
                    if _last_err > 3.0 * mae_val:
                        anomaly = {
                            "actual":    round(float(act[-1]), 2),
                            "expected":  round(float(pred[-1]), 2),
                            "error":     round(_last_err, 2),
                            "times_typical": round(_last_err / mae_val, 1),
                            "direction": "above" if act[-1] > pred[-1] else "below",
                        }

                # How much evidence is behind that MAPE. It is averaged only over
                # periods with a non-zero actual, so a window of 8 with 3 quiet
                # weeks reports a figure built on 5 - and the page said 128.87%
                # as though all 8 agreed. The caller gets both counts now.
                mape_scored = int(np.sum(np.asarray(act) > 0))
                mape_total  = int(len(act))

                # MASE: error against the naive "same as last period" forecast,
                # measured over the SAME window. Unlike MAPE it is defined when
                # an actual is zero, so the quiet periods count instead of being
                # dropped - which is the honest way to score a series that has
                # them. Below 1.0 beats the naive baseline.
                #
                # The scale has to be measured at the granularity the error is.
                # An annual forecast trains on MONTHLY buckets (agg_rule "MS") and
                # only aggregates to years to score, so mae_val is on annual totals
                # while this series is still monthly. Dividing one by the other is a
                # unit mismatch: a forecast that IS the naive baseline scored ~32
                # instead of ~1, so every annual forecast read as hopeless.
                mase_val = None
                _tv = np.asarray(original_values[:bt_start], dtype=float)
                if forecast_type == "annually" and _tv.size > 0:
                    _tv = (
                        pd.Series(_tv, index=pd.to_datetime(df["Date"].values[:bt_start]))
                        .resample("YS").sum().values
                    )
                # Fewer than two periods at the scored granularity gives no step to
                # measure, and None is better than a number built on one difference.
                if _tv.size >= 2:
                    _naive = float(np.mean(np.abs(np.diff(_tv))))
                    if _naive > 0:
                        mase_val = round(mae_val / _naive, 4)

                # MAE-ratio fallback: used when all backtest actuals are zero
                # (MAPE returns None in that case — this gives a rough alternative)
                mae_ratio     = None
                nz_train_mean = (
                    float(np.mean(train_vals[train_vals > 0]))
                    if np.any(train_vals > 0) else None
                )
                if mape_val is None and nz_train_mean and nz_train_mean > 0:
                    mae_ratio = round((mae_val / nz_train_mean) * 100, 2)

                # Longest unbroken run of zero periods in the training window. A
                # shop that traded nothing for fifteen straight weeks and a system
                # nobody entered anything into look identical here, and the second
                # is not demand - it drags the level down and the recovery then
                # reads as a steep trend worth extrapolating.
                # What counts as a blackout depends on the bucket: fifteen dead
                # weeks are only three dead months, so a flat threshold misses it
                # at the coarser granularities.
                _gap_limit = {"weekly": 6, "monthly": 3, "annually": 1}.get(forecast_type, 6)
                _gap_run = 0
                _run = 0
                for _v in np.asarray(original_values[:bt_start], dtype=float):
                    _run = _run + 1 if _v == 0 else 0
                    if _run > _gap_run:
                        _gap_run = _run

                # Precision / Recall / F1 for direction accuracy (within 20% threshold)
                # A period with no demand cannot be "within 20%" of anything. It used
                # to be handed an error of 0.0, which passed the threshold, so every
                # quiet week counted as a perfect forecast - three of eight zero weeks
                # plus one real hit is where the uniform 50% hit rate came from.
                _bt_threshold = 0.20
                _bt_nz        = act > 0
                _bt_pct_err   = np.zeros_like(act, dtype=float)
                if _bt_nz.any():
                    _bt_pct_err[_bt_nz] = np.abs(act[_bt_nz] - pred[_bt_nz]) / act[_bt_nz]
                _bt_within    = _bt_nz & (_bt_pct_err <= _bt_threshold)
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
                    "rmse":              round(rmse_val, 2),
                    "anomaly":           anomaly,
                    "mae_ratio":         mae_ratio,
                    "backtest_n":        bt_periods if forecast_type != "annually" else int(n_agg),
                    "backtest_nz_count": int(np.sum(act > 0)) if forecast_type == "annually" else bt_nz,
                    "precision":         round(_bt_prec, 4),
                    "recall":            round(_bt_rec, 4),
                    "f1":                round(_bt_f1, 4),
                    "hit_rate":          round(float(np.mean(_bt_within[_bt_nz])) * 100, 2) if _bt_nz.any() else None,
                    "hit_rate_scored":   int(_bt_nz.sum()),
                    "mape_scored":       mape_scored,
                    "mape_total":          mape_total,
                    "mase":              mase_val,
                    "training_gap":      _gap_run if _gap_run >= _gap_limit else 0,
                    # A figure averaged over two or three periods is not an
                    # accuracy; it is two or three numbers. The old flag checked
                    # only the period type and a 300% ceiling, so annual revenue
                    # returned 213% from TWO scored points and still came back
                    # green. It now has to have something behind it, and a long
                    # blank stretch in the training window disqualifies it too -
                    # a run of zeros that means "nobody was using the system"
                    # trains the model on demand that never existed.
                    "mape_reliable":     (forecast_type != "annually" or int(n_agg) >= 2)
                                         and not (is_high_volatility and mape_val is not None and mape_val > 300)
                                         and mape_val is not None
                                         and mape_scored >= 4
                                         and _gap_run < _gap_limit,
                    # WHEN the figure was measured, and on how much training.
                    # Without these the caller is told "averaged over 5 of 8
                    # periods" and cannot tell whether those periods were last
                    # month or two years ago, nor that the window may have slid
                    # off the tail to find them. backtest_is_recent is False
                    # exactly when it slid, which is the case worth a caveat.
                    "backtest_from":     pd.Timestamp(bt_display_dates[0]).strftime("%Y-%m-%d")
                                         if len(bt_display_dates) else None,
                    "backtest_to":       pd.Timestamp(bt_display_dates[-1]).strftime("%Y-%m-%d")
                                         if len(bt_display_dates) else None,
                    "backtest_train_n":  int(bt_start),
                    "backtest_is_recent": bool(bt_start == n - bt_periods),
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

        # gap_offset tracks how many periods we skip to reach today;
        # used later to give honest CI widths from the true LRF horizon.
        gap_offset = 0

        if forecast_type == "weekly":
            today_monday = business_now().normalize()
            today_monday -= pd.Timedelta(days=today_monday.dayofweek)
            natural_start = last_date + pd.Timedelta(weeks=1)
            fc_start  = max(natural_start, today_monday)
            gap_weeks = max(0, (fc_start - natural_start).days // 7)
            gap_offset     = gap_weeks
            extended_steps = gap_weeks + forecast_periods
            fc_dates = pd.date_range(start=fc_start, periods=forecast_periods, freq="W-MON")
        elif forecast_type == "monthly":
            this_month     = business_now().replace(day=1).normalize()
            natural_start_m = last_date + pd.DateOffset(months=1)
            fc_start_m     = max(natural_start_m, this_month)
            gap_months     = max(0, (fc_start_m.year - natural_start_m.year) * 12
                                    + (fc_start_m.month - natural_start_m.month))
            gap_offset     = gap_months
            extended_steps = gap_months + forecast_periods
            fc_dates = pd.date_range(start=fc_start_m, periods=forecast_periods, freq="MS")
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
            extended_steps = monthly_steps  # annual uses its own logic

        try:
            if forecast_type == "annually":
                raw_fc = ssa.forecast(components, steps=monthly_steps)
            elif gap_offset > 0:
                raw_fc_full = ssa.forecast(components, steps=extended_steps)
                raw_fc = raw_fc_full[gap_offset:]
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

        # Cap, Croston override, dampening and floor - all of it now lives in
        # apply_forecast_post so the backtest can run the identical transforms.
        # hist_vals stays the unfloored history; downstream CI code still uses it.
        hist_vals = original_values
        demand_cls, demand_adi, demand_cv2 = demand_profile(original_values)
        out_vals, forecast_method, is_dampened = apply_forecast_post(
            out_vals, original_values, df["Date"].values, forecast_type, is_sparse
        )
        if forecast_type == "annually" and len(hist_vals) > 0:
            _ann_cap_sums = pd.Series(hist_vals, index=pd.to_datetime(df["Date"])).resample("YS").sum().values
            hist_max  = float(_ann_cap_sums.max())  if len(_ann_cap_sums) > 0 else 1.0
            hist_mean = float(_ann_cap_sums.mean()) if len(_ann_cap_sums) > 0 else 1.0
        else:
            hist_max  = float(hist_vals.max())  if len(hist_vals) > 0 else 1.0
            hist_mean = float(hist_vals.mean()) if len(hist_vals) > 0 else 1.0
        cap = max(hist_max * 1.5, hist_mean * 2, 1.0)

        # ── Cap CI growth so it doesn't explode on long horizons ─────────────
        # noise_std on sparse spike data can be very large (residuals from spike
        # weeks dominate), so the upper bound is held to just above the
        # historical max rather than running away.
        #
        # The lower bound is only held at zero. It used to be floored at 20% of
        # the point forecast - "never pure zero" - which on an intermittent
        # material excluded the single most likely outcome from a band the page
        # draws as "Likely range". That is the same cosmetic floor as the history
        # line that drew P4,500 on 1,055 days with no sale. The page's own
        # fallback band already allowed zero, so the two disagreed.
        n_out      = len(out_vals)
        max_growth = np.sqrt(extended_steps)
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
            float(min(hist_max_ceiling, out_vals[i] + 1.96 * ci_scale * min(np.sqrt(gap_offset + i + 1), max_growth)))
            for i in range(n_out)
        ]
        conf_low = [
            float(max(0.0, out_vals[i] - 1.96 * ci_scale * min(np.sqrt(gap_offset + i + 1), max_growth)))
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

        # No floor here. SSA gets its own floored copy in df["Value"]; this series
        # is only ever drawn. Flooring it put peak/4 on every quiet day, so the
        # history line on the chart never touched zero - on the live revenue data
        # that was 1,055 of 1,367 days drawn at 4,500 when the shop took nothing.
        # trend_daily and seas_daily are interpolated from the training
        # decomposition, so the residual below still sums to what is displayed.

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

        # ── Build training_data series for the chart ─────────────────────────
        # For annual forecasts the SSA trains on MONTHLY buckets but the forecast
        # is annual-aggregated. We must aggregate the training series to annual too,
        # otherwise the chart plots ~6K monthly history against ~108K annual forecast
        # and the two lines visually disconnect.
        if forecast_type == "annually":
            _ts_idx    = pd.to_datetime(df["Date"])
            _noise_arr = df["Value"].values - trend - seasonality
            _ann_v = pd.Series(original_values, index=_ts_idx).resample("YS").sum()
            _ann_t = pd.Series(trend,           index=_ts_idx).resample("YS").sum()
            _ann_s = pd.Series(seasonality,     index=_ts_idx).resample("YS").sum()
            _ann_n = pd.Series(_noise_arr,      index=_ts_idx).resample("YS").sum()
            train_dates_out = _ann_v.index.strftime("%Y-%m-%d").tolist()
            train_vals_out  = _ann_v.values.tolist()
            train_trend_out = _ann_t.values.tolist()
            train_seas_out  = _ann_s.values.tolist()
            train_noise_out = _ann_n.values.tolist()
        else:
            train_dates_out = df["Date"].dt.strftime("%Y-%m-%d").tolist()
            train_vals_out  = original_values.tolist()
            train_trend_out = trend.tolist()
            train_seas_out  = seasonality.tolist()
            train_noise_out = (df["Value"].values - trend - seasonality).tolist()

        return {
            "historical": {
                "dates":       daily_rev["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "values":      daily_rev["Value"].tolist(),
                "trend":       trend_daily.tolist(),
                "seasonality": seas_daily.tolist(),
                "noise":       noise_daily.tolist(),
            },
            # training_data: the aggregated (weekly/monthly/annual) time series
            # used for SSA — unfloored original values + decomposition at the
            # same granularity as the forecast. Used by the frontend chart to
            # show a consistent historical slice at period-level resolution.
            "training_data": {
                "dates":       train_dates_out,
                "values":      train_vals_out,
                "trend":       train_trend_out,
                "seasonality": train_seas_out,
                "noise":       train_noise_out,
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
            # Phase C: which estimator produced the forecast + the demand class.
            "method":            forecast_method,
            "demand_class":      demand_cls,
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
        raise _server_error("/api/forecast", e)


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


# ── Inventory plan: forecast + policy + decision in one response ──────────
#
# The forecast page computed its reorder point from one demand number and
# depleted its chart with another, and the shop's To Buy list computed a
# third from orders in hand. This endpoint returns all three layers from the
# same figures so nothing downstream can disagree: the shop's backend calls
# it nightly and stores the result on the material; the page reads the same
# stored plan.
#
# Contract and rules are the restock proposal's:
#   no linked demand   -> demand.per_week null, decision null, basis says so
#   lead_time_assumed  -> carried into policy, shown beside every derived number
#   n_weeks < 8        -> low_confidence true
#   reorder_point      -> suggested; minStockLevel is never written by a job

Z_FOR_SERVICE_LEVEL = {0.80: 0.842, 0.85: 1.036, 0.90: 1.282, 0.95: 1.645, 0.975: 1.960, 0.99: 2.326}

def _z_for(service_level: float) -> float:
    """Nearest tabulated z. A handful of service levels cover every real choice here."""
    keys = sorted(Z_FOR_SERVICE_LEVEL)
    nearest = min(keys, key=lambda k: abs(k - service_level))
    return Z_FOR_SERVICE_LEVEL[nearest]


class PlanMaterial(BaseModel):
    id: str
    name: str = ""
    uom: str = ""

class InventoryPlanRequest(BaseModel):
    material: PlanMaterial
    rows: List[DataRow]                 # daily demand in material units; zeros allowed
    on_hand: float = 0.0
    reserved: float = 0.0
    on_order: float = 0.0
    lead_time_days: float = 7.0
    lead_time_assumed: bool = True
    lead_time_sigma_days: float = 0.0  # measured spread of the lead time, 0 when unknown
    review_days: float = 7.0
    service_level: float = 0.95
    bucket: str = "weekly"             # "weekly" | "monthly"
    history_used: str = "ledger"       # what the caller built rows from; echoed back


@app.post("/api/inventory-plan")
async def inventory_plan(req: InventoryPlanRequest):
    try:
        if req.bucket not in ("weekly", "monthly"):
            raise HTTPException(status_code=400, detail="bucket must be weekly or monthly")
        days_per_period = 7.0 if req.bucket == "weekly" else 30.44
        z = _z_for(req.service_level)
        available = max(0.0, req.on_hand - req.reserved + req.on_order)
        position = {
            "on_hand": req.on_hand, "reserved": req.reserved,
            "on_order": req.on_order, "available": available,
        }

        # ── No linked demand: say so, never draw a flat green line ────────
        rows = [r for r in req.rows if r.value is not None]
        total_units = float(sum(max(0.0, r.value) for r in rows))
        if len(rows) == 0 or total_units <= 0:
            return {
                "demand":   {"per_day": None, "per_week": None, "sigma_week": None,
                             "class": "none", "method": None, "n_weeks": 0,
                             "low_confidence": True, "history_used": req.history_used},
                "forecast": None,
                "policy":   {"z": z, "lead_time_days": req.lead_time_days,
                             "lead_time_assumed": req.lead_time_assumed,
                             "review_days": req.review_days,
                             "safety_stock": None, "reorder_point": None, "order_up_to": None},
                "position": position,
                "decision": None,
                "basis":    "No demand recorded for " + (req.material.name or req.material.id)
                            + ": nothing has consumed it, so there is nothing to plan from.",
            }

        # ── Forecast: reuse the forecast endpoint as a function ───────────
        # Ask for one review cycle beyond the lead time; the service clamps
        # to its own safe horizon, and a thin series is retried at one period
        # so it still yields a rate rather than an error.
        want_periods = max(1, int(round((req.lead_time_days + req.review_days) / days_per_period)))
        fc = None
        fc_error = None
        for periods in (want_periods, 1):
            try:
                fc = await forecast(ForecastRequest(
                    rows=rows, forecast_periods=periods,
                    forecast_type=req.bucket, data_type="demand",
                ))
                fc_error = None
                break
            except HTTPException as e:
                fc_error = str(e.detail).split("\n")[0]
                if "exceeds the safe forecast horizon" not in fc_error:
                    break

        # ── Rate and spread, from the same figures the chart would use ────
        if fc is not None:
            fc_vals = [float(v) for v in (fc.get("forecast", {}).get("values") or []) if v is not None]
            train   = [float(v) for v in (fc.get("training_data", {}).get("values") or []) if v is not None]
            method = fc.get("method") or "ssa"
            demand_cls = fc.get("demand_class") or "new"
            n_periods = int(fc.get("training_n") or len(train))
            forecast_block = fc.get("forecast")
            # The rate to plan against. The forecast's own rate once there is
            # enough history for it to mean something; the plain mean before
            # that. Croston/SBA at alpha 0.1 is still anchored to its first
            # observation for twenty-odd periods - on four weeks of 10, 0, 50,
            # 30 it returns 13.6 against a mean of 22.5 and would under-order
            # by forty percent. Eight weeks is the proposal's own confidence
            # line, and below it the mean is the better estimator.
            fc_rate   = (sum(fc_vals) / len(fc_vals)) if fc_vals else None
            mean_rate = (sum(train) / len(train)) if train else 0.0
            n_weeks_est = n_periods * days_per_period / 7.0
            use_mean = (fc_rate is None) or (n_weeks_est < 8)
            d_period = mean_rate if use_mean else fc_rate
            rate_source = "mean" if use_mean else method
        else:
            # Average-demand fallback, the same one the page uses when the
            # service cannot run: total over the span the rows cover.
            first = pd.to_datetime(rows[0].date); last = pd.to_datetime(rows[-1].date)
            span_days = max(1.0, (last - first).days + 1.0)
            d_period = total_units / max(1.0, span_days / days_per_period)
            df = pd.DataFrame([{"Date": pd.to_datetime(r.date), "Value": r.value} for r in rows])
            rule = "W-MON" if req.bucket == "weekly" else "MS"
            train = df.set_index("Date").resample(rule)["Value"].sum().tolist()
            method = "average"
            rate_source = "mean"
            demand_cls = demand_profile(np.asarray(train, dtype=float))[0] if len(train) >= 3 else "new"
            n_periods = len(train)
            forecast_block = None

        if len(train) > 1:
            mean_t = sum(train) / len(train)
            sigma_period = float(np.sqrt(sum((v - mean_t) ** 2 for v in train) / (len(train) - 1)))
        else:
            sigma_period = 0.0

        per_day  = d_period / days_per_period
        per_week = per_day * 7.0
        sigma_week = sigma_period * float(np.sqrt(7.0 / days_per_period))
        n_weeks = int(round(n_periods * days_per_period / 7.0))
        low_confidence = n_weeks < 8 or method == "average"

        # ── Policy: reorder point and order-up-to, both spreads ───────────
        L  = req.lead_time_days / days_per_period
        R  = req.review_days / days_per_period
        sL = req.lead_time_sigma_days / days_per_period
        d  = d_period
        ss   = max(0.0, z * float(np.sqrt(L * sigma_period ** 2 + d ** 2 * sL ** 2)))
        rop  = d * L + ss
        s_up = d * (L + R) + max(0.0, z * float(np.sqrt((L + R) * sigma_period ** 2 + d ** 2 * sL ** 2)))

        # ── Decision ──────────────────────────────────────────────────────
        restock = max(0.0, s_up - available)
        reorder_now = available <= rop
        days_to_reorder = 0.0 if (reorder_now or per_day <= 0) else (available - rop) / per_day
        stockout_days = None if per_day <= 0 else available / per_day

        # Overstock: the other end of the same question the reorder point answers.
        # The policy plans to cover lead time plus one review cycle; holding several
        # times that is money sitting on a shelf, and on a perishable or a design
        # that dates, it is money that may never come back. Three times the target
        # window is the line - under that, a buffer; over it, a surplus worth naming.
        target_days   = float(req.lead_time_days) + float(req.review_days)
        cover_days    = stockout_days
        overstocked   = bool(
            cover_days is not None and target_days > 0
            and cover_days > target_days * 3 and available > s_up
        )
        excess_qty    = max(0.0, available - s_up) if overstocked else 0.0
        weeks_of_cover = None if per_week <= 0 else available / per_week
        today = business_now().normalize()
        stockout_date = (today + pd.Timedelta(days=float(stockout_days))).strftime("%Y-%m-%d") \
            if stockout_days is not None else None

        lead_note = ("lead time %gd assumed" % req.lead_time_days) if req.lead_time_assumed \
            else ("lead time %gd" % req.lead_time_days)
        rate_note = ("the mean (too few weeks for the smoother)" if rate_source == "mean" and method != "average"
                     else "Croston/SBA" if rate_source == "sba" else rate_source)
        basis = "%d week%s of %s; %s demand, rate from %s; %s%s" % (
            n_weeks, "" if n_weeks == 1 else "s", req.history_used,
            demand_cls, rate_note, lead_note,
            "; band is wide" if low_confidence else "",
        )
        if fc_error and fc is None:
            basis += "; forecast service declined (%s), using the average instead" % fc_error

        return {
            "demand": {
                "per_day":        round(per_day, 3),
                "per_week":       round(per_week, 2),
                "sigma_week":     round(sigma_week, 2),
                "class":          demand_cls,
                "method":         "croston_sba" if method == "sba" else method,
                "n_weeks":        n_weeks,
                "low_confidence": bool(low_confidence),
                "history_used":   req.history_used,
            },
            "forecast": forecast_block,
            "policy": {
                "z":                 z,
                "lead_time_days":    req.lead_time_days,
                "lead_time_assumed": req.lead_time_assumed,
                "review_days":       req.review_days,
                "safety_stock":      int(round(ss)),
                "reorder_point":     int(round(rop)),
                "order_up_to":       int(round(s_up)),
            },
            "position": position,
            "decision": {
                "restock_qty":     int(round(restock)),
                "reorder_now":     bool(reorder_now),
                "overstocked":     overstocked,
                "excess_qty":      int(round(excess_qty)),
                "weeks_of_cover":  round(weeks_of_cover, 1) if weeks_of_cover is not None else None,
                "days_to_reorder": int(round(days_to_reorder)),
                "stockout_date":   stockout_date,
                "basis":           basis,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error("/api/inventory-plan", e)


@app.post("/api/customer-segments")
async def customer_segments(req: RFMRequest):
    try:
        if not req.sales:
            raise HTTPException(status_code=400, detail="No sales data provided.")

        df = pd.DataFrame([{
            "email":  s.customerEmail,
            "amount": s.totalPrice,
            "date":   pd.to_datetime(s.saleDate, errors="coerce"),
            "order":  s.orderKey or f"row_{i}",
        } for i, s in enumerate(req.sales)])
        df = df.dropna(subset=["date"])
        if df.empty:
            raise HTTPException(status_code=400, detail="No valid sale rows after date parsing.")

        # Strip timezone info so tz-aware MongoDB dates don't clash with tz-naive Timestamp
        if df["date"].dt.tz is not None:
            df["date"] = df["date"].dt.tz_convert("UTC").dt.tz_localize(None)

        # Recency is measured against the latest sale in the dataset (the analysis
        # snapshot), not the server clock — so historical data isn't scored as "stale".
        ref_date = (
            pd.to_datetime(req.reference_date).tz_localize(None)
            if req.reference_date
            else df["date"].max()
        )

        rfm = df.groupby("email").agg(
            recency=("date",   lambda x: (ref_date - x.max()).days),
            frequency=("order", "nunique"),   # distinct orders/visits, not line-item rows
            monetary=("amount","sum"),
        ).reset_index()

        def _qscore(series, ascending=True):
            labels = [1, 2, 3, 4, 5] if ascending else [5, 4, 3, 2, 1]
            try:
                return pd.qcut(series, q=5, labels=labels, duplicates="drop").astype(int)
            except ValueError:
                # "first" breaks ties by row order, so five customers with identical
                # spend scored 1,2,3,4,5 by position and could land in different
                # segments - and the assignment changed if the query returned rows
                # in another order. "average" gives equal customers equal scores.
                ranked = series.rank(method="average", ascending=ascending)
                return pd.cut(ranked, bins=5, labels=[1, 2, 3, 4, 5],
                              include_lowest=True).astype(int)

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
        raise _server_error("/api/customer-segments", e)


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

        # Guarded: the share above is, this was not, so a period with no revenue
        # divided by zero and silently classed every product C.
        cumulative = (
            (summary["total_revenue"].cumsum() / total_rev) if total_rev > 0
            else pd.Series(1.0, index=summary.index)
        )
        # The product that CROSSES 70% belongs in A - it is part of the block that
        # makes up the first 70%, not the start of the next one. Same at 90%.
        prev = cumulative.shift(1).fillna(0.0)
        summary["abc_class"] = "C"
        summary.loc[prev < 0.70,                      "abc_class"] = "A"
        summary.loc[(prev >= 0.70) & (prev < 0.90),   "abc_class"] = "B"

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
        raise _server_error("/api/service-segments", e)


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
        nz       = actuals > 0
        pct_err  = np.zeros_like(actuals, dtype=float)
        if nz.any():
            pct_err[nz] = abs_err[nz] / actuals[nz]
        # Same rule as the backtest: a zero actual is not a hit, it is unscoreable.
        within   = nz & (pct_err <= threshold)

        mape = float(np.mean(pct_err[nz]) * 100) if nz.any() else None
        mae  = float(np.mean(abs_err))
        rmse = float(np.sqrt(np.mean((actuals - forecasts) ** 2)))
        bias = float(np.mean(forecasts - actuals))
        # Both sides masked. Dividing an N-element difference by an M-element
        # actuals[actuals > 0] raised ValueError on any zero actual, which is 26%
        # of the weekly series - so this endpoint answered 500 on real data.
        bias_pct = float(np.mean((forecasts[nz] - actuals[nz]) / actuals[nz]) * 100) if nz.any() else None

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
                "hit_rate":      round(float(np.mean(within[nz])) * 100, 2) if nz.any() else None,
                "hit_rate_scored": int(nz.sum()),
                "threshold_pct": req.threshold_pct,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise _server_error("/api/comparative", e)