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
    const [expiresAt, setExpiresAt] = useState(null);

    useEffect(() => {
        const checkAuth = async () => {
            const storedUser  = localStorage.getItem('auth_user');
            const storedToken = localStorage.getItem('auth_token');

            if (storedUser && storedToken) {
                try {
                    setCurrentUser(JSON.parse(storedUser));
                    setToken(storedToken);
                    setExpiresAt(localStorage.getItem('auth_expires_at'));
                    setIsLoading(false);
                } catch { /* ignore parse error */ }
            }

            try {
                if (!storedUser || !storedToken) return;

                const lastValidated = parseInt(localStorage.getItem('auth_validated_at') || '0', 10);
                if (Date.now() - lastValidated < 5 * 60 * 1000) return;

                const lastChecked = parseInt(localStorage.getItem('auth_checked_at') || '0', 10);
                if (Date.now() - lastChecked < 60 * 1000) return;

                const attemptStamp = String(Date.now());
                try { localStorage.setItem('auth_checked_at', attemptStamp); } catch {}

                const res = await fetchWithTimeout(`${API_URL}/api/user`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${storedToken}`,
                    },
                }, 8000);

                if (res.status === 401) {
                    sessionStorage.setItem('sessionExpired', 'true');
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                    localStorage.removeItem('auth_expires_at');
                    localStorage.removeItem('auth_validated_at');
                    localStorage.removeItem('auth_checked_at');
                    setCurrentUser(null);
                    setToken(null);
                    setExpiresAt(null);
                    window.location.href = '/';
                    return;
                }

                if (!res.ok) return;

                const userData = await res.json();
                const u = userData.user ?? userData;
                setCurrentUser(u);
                setToken(storedToken);
                const exp = u?.token_expires_at;
                if (exp) {
                    try { localStorage.setItem('auth_expires_at', exp); } catch {}
                    setExpiresAt(exp);
                }
                const stamp = String(Date.now());
                try {
                    localStorage.setItem('auth_validated_at', stamp);
                    localStorage.setItem('auth_checked_at', stamp);
                } catch {}
            } catch {
                // Network failure — keep existing session, do not log out
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    useEffect(() => {
        const handleStorageChange = () => {
            const t = localStorage.getItem('auth_token');
            const s = localStorage.getItem('auth_user');
            if (!t || !s) {
                setCurrentUser(null);
                setToken(null);
                return;
            }
            try {
                setCurrentUser(JSON.parse(s));
                setToken(t);
            } catch {}
        };

        window.addEventListener('storage', handleStorageChange);

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
            const interval = setInterval(() => {
                const t = localStorage.getItem('auth_token');
                const s = localStorage.getItem('auth_user');
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
            localStorage.removeItem('auth_expires_at');
            localStorage.removeItem('auth_validated_at');
            localStorage.removeItem('auth_checked_at');
            setCurrentUser(null);
            setToken(null);
            setExpiresAt(null);
            try {
                const bc = new BroadcastChannel('pmp_auth');
                bc.postMessage({ type: 'AUTH_LOGOUT' });
                bc.close();
            } catch {}
            sessionStorage.setItem('justLoggedOut', 'true');
            window.location.href = '/';
        }
    };

    // Re-issue the token with a fresh expiry so an active user can "Stay logged in".
    const refreshSession = async () => {
        const t = token || localStorage.getItem('auth_token');
        if (!t) return false;
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${t}`,
                },
            }, 10000);
            if (!res.ok) return false;
            const data = await res.json();
            const payload = data.data ?? data;
            if (payload.token) {
                localStorage.setItem('auth_token', payload.token);
                setToken(payload.token);
            }
            if (payload.expires_at) {
                localStorage.setItem('auth_expires_at', payload.expires_at);
                setExpiresAt(payload.expires_at);
            }
            try {
                const bc = new BroadcastChannel('pmp_auth');
                bc.postMessage({ type: 'AUTH_UPDATE', token: payload.token, user: currentUser });
                bc.close();
            } catch {}
            return true;
        } catch {
            return false;
        }
    };

    const updateUser = (updateData) => {
        let current = {};
        try { current = JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch {}
        const merged = { ...current, ...updateData };
        localStorage.setItem('auth_user', JSON.stringify(merged));
        setCurrentUser(merged);
    };

    return (
        <AuthContext.Provider value={{currentUser, setCurrentUser, updateUser, logout, isLoading, token, expiresAt, refreshSession}}>
            {isLoading ? null : children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
