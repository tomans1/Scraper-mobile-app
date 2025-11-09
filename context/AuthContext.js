import { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthAPI from '../api/auth';

export const AuthContext = createContext();

const TOKEN_KEY = 'scraper_auth_token';

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAuthState();
  }, []);

  async function loadAuthState() {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        global.authToken = token;
        const data = await AuthAPI.checkAuthStatus();
        setIsAuthenticated(data.authenticated);
        if (!data.authenticated) {
          await AsyncStorage.removeItem(TOKEN_KEY);
          global.authToken = null;
        }
      }
      setError(null);
    } catch (err) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function checkAuth() {
    try {
      setIsLoading(true);
      const data = await AuthAPI.checkAuthStatus();
      setIsAuthenticated(data.authenticated);
      setError(null);
    } catch (err) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin(password) {
    try {
      setError(null);
      const data = await AuthAPI.login(password);
      if (data.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        global.authToken = data.token;
      }
      await checkAuth();
      return true;
    } catch (err) {
      setError(err.message || 'Login failed');
      return false;
    }
  }

  async function handleLogout() {
    try {
      await AuthAPI.logout();
      await AsyncStorage.removeItem(TOKEN_KEY);
      global.authToken = null;
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      setError(err.message || 'Logout failed');
    }
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        checkAuth,
        handleLogin,
        handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
