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

    useEffect(() => {
        const stored = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
        if (stored) {
            try {
                setCurrentUser(JSON.parse(stored));
            } catch {
                setCurrentUser(null);
            }
        }
    }, []);

    const logout = async () => {
        try {
            const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
            if (token) {
                await fetch(`${API_URL}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
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
        }
    };

    const updateUser = (updateData) => {
        const isLocal = !!localStorage.getItem('auth_user');
        const storage = isLocal ? localStorage : sessionStorage;
        const current = JSON.parse(storage.getItem('auth_user') || '{}');
        const merged = {...current, ...updateData};
        storage.setItem('auth_user', JSON.stringify(merged));
        setCurrentUser(merged); 
    };

    return (
        <AuthContext.Provider value={{currentUser, setCurrentUser, updateUser, logout}}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}