'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = (email, password, userType = 'customer') => {
    // Mock authentication - in a real app, you would verify credentials with a backend
    // In the future, user type will be determined by the backend based on the user's account
    if (email && password) {
      const user = {
        id: Date.now(),
        email,
        userType, // This will eventually come from the backend
        name: email.split('@')[0], // Just for demo purposes
      };
      
      setCurrentUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    }
    return false;
  };

  const signup = (name, email, password, userType = 'customer') => {
    // Mock signup - in a real app, you would send data to a backend
    // In the future, user type will be determined by the backend based on the user's account
    if (name && email && password) {
      const user = {
        id: Date.now(),
        email,
        userType, // This will eventually come from the backend
        name,
      };
      
      setCurrentUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('user');
  };

  const value = {
    currentUser,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}