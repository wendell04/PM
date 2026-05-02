import numpy as np


def dominant_period(series, max_lag=None, acf_threshold=0.15):
    """Return the lag of the first significant ACF peak, or None.

    acf_threshold: minimum ACF value to qualify as a real peak (0.15 avoids
    false detections on noisy/sparse data; lower values risk picking up noise).
    """
    n = len(series)
    if max_lag is None:
        max_lag = n // 2
    max_lag = min(max_lag, n - 1)
    s = series - np.mean(series)
    var = np.var(s)
    if var == 0:
        return None

    # FIX: Sparsity guard — if more than 70% of the series is zero, the ACF
    # is dominated by a handful of large spikes rather than true seasonality.
    # In that case the detected "period" is just the distance between two
    # random spikes (e.g. period=25 from two Christmas-like events), which
    # causes SSA to project those spikes forward as a recurring seasonal pattern.
    # Returning None here forces the fallback L heuristic (min(26, n//2))
    # which produces a more conservative, flat forecast closer to recent actuals.
    nonzero_ratio = np.sum(series > 0) / len(series)
    if nonzero_ratio < 0.30:
        return None  # too sparse for reliable ACF period detection

    acf = np.array([
        np.dot(s[:n - k], s[k:]) / ((n - k) * var)
        for k in range(1, max_lag + 1)
    ])
    for i in range(1, len(acf) - 1):
        if acf[i] > acf[i - 1] and acf[i] > acf[i + 1] and acf[i] > acf_threshold:
            return i + 1
    return None


class SSA:
    def __init__(self, tseries, L):
        self.tseries = np.array(tseries)
        self.N = len(self.tseries)
        self.L = L
        if self.L > self.N // 2:
            self.L = self.N // 2
        self.K = self.N - self.L + 1
        self.X = np.column_stack([self.tseries[i:i+self.L] for i in range(self.K)])
        self.U, self.Sigma, self.VT = np.linalg.svd(self.X)
        self.d = np.linalg.matrix_rank(self.X)

    def reconstruct(self, components):
        if isinstance(components, int):
            components = [components]
        X_elem = np.zeros_like(self.X, dtype=float)
        for i in components:
            if i < len(self.Sigma):
                X_elem += self.Sigma[i] * np.outer(self.U[:, i], self.VT[i, :])
        rcs = np.zeros(self.N)
        counts = np.zeros(self.N)
        for i in range(self.L):
            for j in range(self.K):
                rcs[i+j] += X_elem[i, j]
                counts[i+j] += 1
        return rcs / counts

    def forecast(self, components, steps=30):
        if isinstance(components, int):
            components = [components]
        components = [c for c in components if c < len(self.Sigma)]

        # Progressively drop the smallest (last) component until LRF is stable.
        # This avoids crashing on sparse data where higher-order components
        # introduce numerical instability (v_sq >= 1.0).
        stable = list(components)
        while stable:
            pi_m = self.U[-1, stable]
            if np.sum(pi_m ** 2) < 1.0:
                break
            stable = stable[:-1]

        if not stable:
            raise ValueError(
                "LRF is numerically unstable even for component 0. "
                "More historical data is required."
            )

        U_m  = self.U[:-1, stable]
        pi_m = self.U[-1, stable]
        v_sq = np.sum(pi_m ** 2)
        R = np.zeros(self.L - 1)
        for i in range(len(stable)):
            R += pi_m[i] * U_m[:, i]
        R /= (1 - v_sq)
        rec = self.reconstruct(stable)
        predictions = list(rec)
        for _ in range(steps):
            last_window = np.array(predictions[-(self.L - 1):])
            next_val = np.dot(R, last_window)
            predictions.append(next_val)
        return np.array(predictions[-steps:])