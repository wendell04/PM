import numpy as np

def dominant_period(series, max_lag=None):
    n = len(series)
    if max_lag is None:
        max_lag = n // 2
    max_lag = min(max_lag, n - 1)
    s = series - np.mean(series)
    var = np.var(s)
    if var == 0:
        return None
    acf = np.array([
        np.dot(s[:n - k], s[k:]) / ((n - k) * var)
        for k in range(1, max_lag + 1)
    ])
    for i in range(1, len(acf) - 1):
        if acf[i] > acf[i - 1] and acf[i] > acf[i + 1] and acf[i] > 0.1:
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
        U_m = self.U[:-1, components]
        pi_m = self.U[-1, components]
        v_sq = np.sum(pi_m**2)
        if v_sq >= 1.0:
            raise ValueError(
                "LRF is numerically unstable for the selected components "
                "(v_sq >= 1.0). Try fewer components or more historical data."
            )
        R = np.zeros(self.L - 1)
        for i in range(len(components)):
            R += pi_m[i] * U_m[:, i]
        R = R / (1 - v_sq)
        rec = self.reconstruct(components)
        predictions = list(rec)
        for _ in range(steps):
            last_window = np.array(predictions[-(self.L-1):])
            next_val = np.dot(R, last_window)
            predictions.append(next_val)
        return np.array(predictions[-steps:])
