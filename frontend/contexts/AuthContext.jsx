'use client';

import {
    createContext,
    useContext,
    useState,
    useEffect
} from 'react';

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

                const user = JSON.parse(stored);
                const res = await fetch(`${API_URL}/api/user`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${storedToken}`,
                    },
                });

                if (!res.ok) throw new Error('Token invalid');

                const userData = await res.json();
                setCurrentUser(userData.user ?? userData);
                setToken(storedToken);
            } catch {
                sessionStorage.setItem('sessionExpired', 'true');
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_user');
                sessionStorage.removeItem('auth_token');
                sessionStorage.removeItem('auth_user');
                setCurrentUser(null);
                setToken(null);
                window.location.href = '/';
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

        // Also poll sessionStorage every 500ms
        // for same-tab updates (storage event
        // does not fire for same-tab changes)
        const interval = setInterval(() => {
            const token =
                sessionStorage.getItem('auth_token') ||
                localStorage.getItem('auth_token');
            const stored =
                sessionStorage.getItem('auth_user') ||
                localStorage.getItem('auth_user');

            // Only update if token changed
            if (token && stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setCurrentUser(prev => {
                        // Don't update if same user
                        if (prev?.email === parsed?.email)
                            return prev;
                        return parsed;
                    });
                    setToken(token);
                } catch {}
            }
        }, 500);

        return () => {
            window.removeEventListener(
                'storage', handleStorageChange);
            clearInterval(interval);
        };
    }, []);

    const logout = async () => {
        try {
            const logoutToken = token;
            if (logoutToken) {
                await fetch(`${API_URL}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${logoutToken}`,
                    },
                });
            }
        } catch (err) {
            console.error('Logout error: ', err);
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_user');
            setCurrentUser(null);
            setToken(null);
            // Redirect based on which app was active
            const isAdmin = window.location.pathname.includes('/dashboard');
            window.location.href = isAdmin ? '/' : '/shop';
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