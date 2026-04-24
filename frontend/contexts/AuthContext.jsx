'use client';

import {
    createContext,
    useContext,
    useState,
    useEffect
} from 'react';

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const AuthContext = createContext(null);

export function AuthProvider({children}) {
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [token, setToken] = useState(null);

    useEffect(() => {
        const checkAuth = async () => {
            // sessionStorage = admin (no Remember Me)
            // localStorage = customer (Remember Me ON)
            // Always prefer sessionStorage if both exist
            const ssUser = sessionStorage.getItem('auth_user');
            const lsUser = localStorage.getItem('auth_user');
            const ssToken = sessionStorage.getItem('auth_token');
            const lsToken = localStorage.getItem('auth_token');

            // If BOTH storages have tokens — clear
            // localStorage (stale customer data)
            // and use sessionStorage (current admin)
            if (ssToken && lsToken) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_user');
            }

            const stored = ssUser || lsUser;
            const storedToken = ssToken || lsToken;

            // Populate currentUser immediately from storage
            // so UI renders without waiting for API
            if (stored && storedToken) {
                try {
                    setCurrentUser(JSON.parse(stored));
                    setToken(storedToken);
                    setIsLoading(false);
                } catch { /* ignore parse error */ }
            }

            try {
                if (!stored || !storedToken) return;

                // Skip remote validation if validated within the last 5 minutes
                const lastValidated = parseInt(localStorage.getItem('auth_validated_at') || sessionStorage.getItem('auth_validated_at') || '0', 10);
                if (Date.now() - lastValidated < 5 * 60 * 1000) return;

                // Skip if we already attempted within the last 60 seconds (prevents
                // spamming the server on every page load when the API is unreachable)
                const lastChecked = parseInt(localStorage.getItem('auth_checked_at') || sessionStorage.getItem('auth_checked_at') || '0', 10);
                if (Date.now() - lastChecked < 60 * 1000) return;

                // Stamp the attempt time before the call so even a crash won't spam
                const attemptStamp = String(Date.now());
                try {
                    if (ssToken) sessionStorage.setItem('auth_checked_at', attemptStamp);
                    else localStorage.setItem('auth_checked_at', attemptStamp);
                } catch { /* storage full */ }

                const res = await fetchWithTimeout(`${API_URL}/api/user`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${storedToken}`,
                    },
                }, 8000);

                if (res.status === 401) {
                    // Token is genuinely invalid — clear and redirect
                    sessionStorage.setItem('sessionExpired', 'true');
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                    localStorage.removeItem('auth_validated_at');
                    localStorage.removeItem('auth_checked_at');
                    sessionStorage.removeItem('auth_token');
                    sessionStorage.removeItem('auth_user');
                    sessionStorage.removeItem('auth_validated_at');
                    sessionStorage.removeItem('auth_checked_at');
                    setCurrentUser(null);
                    setToken(null);
                    window.location.href = '/';
                    return;
                }

                if (!res.ok) {
                    // Non-401 failure (503 = DB down, 500 = server error, etc.) —
                    // keep existing session, do not log out
                    return;
                }

                const userData = await res.json();
                setCurrentUser(userData.user ?? userData);
                setToken(storedToken);
                // Stamp successful validation so we skip the call for the next 5 minutes
                const stamp = String(Date.now());
                try {
                    if (ssToken) {
                        sessionStorage.setItem('auth_validated_at', stamp);
                        sessionStorage.setItem('auth_checked_at', stamp);
                    } else {
                        localStorage.setItem('auth_validated_at', stamp);
                        localStorage.setItem('auth_checked_at', stamp);
                    }
                } catch { /* storage full */ }
            } catch {
                // Network failure or timeout on refresh —
                // do NOT clear storage or redirect
                // User was already populated from storage above
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    // Re-check auth when storage changes
    // (handles login from landing page writing
    // to sessionStorage after AuthContext mounted)
    useEffect(() => {
        const handleStorageChange = () => {
            const token =
                sessionStorage.getItem('auth_token') ||
                localStorage.getItem('auth_token');
            const stored =
                sessionStorage.getItem('auth_user') ||
                localStorage.getItem('auth_user');

            if (!token || !stored) {
                setCurrentUser(null);
                setToken(null);
                return;
            }
            try {
                setCurrentUser(JSON.parse(stored));
                setToken(token);
            } catch {}
        };

        // Listen for storage events (cross-tab)
        window.addEventListener(
            'storage', handleStorageChange);

        // BroadcastChannel for same-tab/cross-tab auth sync
        // (replaces 500ms polling — fires only on actual changes)
        let bc;
        try {
            bc = new BroadcastChannel('pmp_auth');
            bc.onmessage = (e) => {
                if (e.data?.type === 'AUTH_UPDATE') {
                    const { token: newToken, user: newUser } = e.data;
                    if (newToken && newUser) {
                        setToken(newToken);
                        setCurrentUser(newUser);
                    }
                }
                if (e.data?.type === 'AUTH_LOGOUT') {
                    setToken(null);
                    setCurrentUser(null);
                }
            };
        } catch {
            // BroadcastChannel not supported (rare) — fall back to
            // a single 2s interval as a degraded fallback
            const interval = setInterval(() => {
                const t = sessionStorage.getItem('auth_token') ||
                          localStorage.getItem('auth_token');
                const s = sessionStorage.getItem('auth_user') ||
                          localStorage.getItem('auth_user');
                if (t && s) {
                    try {
                        const parsed = JSON.parse(s);
                        setCurrentUser(prev =>
                            prev?.email === parsed?.email ? prev : parsed
                        );
                        setToken(t);
                    } catch {}
                }
            }, 2000);
            return () => {
                window.removeEventListener('storage', handleStorageChange);
                clearInterval(interval);
            };
        }

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            if (bc) bc.close();
        };
    }, []);

    const logout = async () => {
        try {
            const logoutToken = token;
            if (logoutToken) {
                await fetchWithTimeout(`${API_URL}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${logoutToken}`,
                    },
                }, 10000);
            }
        } catch (err) {
            console.error('Logout error: ', err);
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_validated_at');
            localStorage.removeItem('auth_checked_at');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_user');
            sessionStorage.removeItem('auth_validated_at');
            sessionStorage.removeItem('auth_checked_at');
            setCurrentUser(null);
            setToken(null);
            try {
                const bc = new BroadcastChannel('pmp_auth');
                bc.postMessage({ type: 'AUTH_LOGOUT' });
                bc.close();
            } catch {}
            sessionStorage.setItem('justLoggedOut', 'true');
            // Always redirect to landing page — no dedicated admin login route exists
            window.location.href = '/';
        }
    };

    const updateUser = (updateData) => {
        // Use same priority as checkAuth:
        // sessionStorage wins if both exist
        const isSession = !!sessionStorage.getItem('auth_user');
        const storage = isSession ? sessionStorage : localStorage;
        let current = {};
        try {
            current = JSON.parse(storage.getItem('auth_user') || '{}');
        } catch {
            current = {};
        }
        const merged = {...current, ...updateData};
        storage.setItem('auth_user', JSON.stringify(merged));
        setCurrentUser(merged);
    };

    return (
        <AuthContext.Provider value={{currentUser, setCurrentUser, updateUser, logout, isLoading, token}}>
            {isLoading ? null : children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}