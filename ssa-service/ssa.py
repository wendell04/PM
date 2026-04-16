import numpy as np

class SSA:
    def __init__(self, tseries, L):
        # Time series and Window Length L
        self.tseries = np.array(tseries)
        self.N = len(self.tseries)
        self.L = L
        if self.L > self.N // 2:
            self.L = self.N // 2 # Ensure window length is valid
        self.K = self.N - self.L + 1
        
        # Step 1: Embedding (Trajectory Matrix)
        self.X = np.column_stack([self.tseries[i:i+self.L] for i in range(self.K)])
        
        # Step 2: Singular Value Decomposition (SVD)
        self.U, self.Sigma, self.VT = np.linalg.svd(self.X)
        self.d = np.linalg.matrix_rank(self.X)

    def reconstruct(self, components):
        # Step 3 & 4: Grouping and Diagonal Averaging
        if isinstance(components, int): components = [components]
        
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
        # Step 5: Forecasting via Linear Recurrent Formula (LRF)
        if isinstance(components, int): components = [components]
        components = [c for c in components if c < len(self.Sigma)]
        
        U_m = self.U[:-1, components] # L-1 x r
        pi_m = self.U[-1, components] # r
        
        v_sq = np.sum(pi_m**2)
        if v_sq >= 1.0:
            print("Warning: LRF not stable for chosen components.")
            return np.zeros(steps)
            
        R = np.zeros(self.L - 1)
        for i, c in enumerate(components):
            R += pi_m[i] * U_m[:, i]
        R = R / (1 - v_sq)
        
        rec = self.reconstruct(components)
        predictions = list(rec)
        
        for _ in range(steps):
            last_window = np.array(predictions[-(self.L-1):])
            next_val = np.dot(R, last_window)
            predictions.append(next_val)
            
        return np.array(predictions[-steps:])
