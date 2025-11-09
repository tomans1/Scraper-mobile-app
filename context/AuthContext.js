import { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthAPI from '../api/auth';
import { setAuthToken } from '../api/client';

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
      setAuthToken(token);
      if (token) {
        const data = await AuthAPI.checkAuthStatus();
        setIsAuthenticated(data.authenticated);
        if (!data.authenticated) {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setAuthToken(null);
        }
      } else {
        setIsAuthenticated(false);
      }
      setError(null);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function checkAuth() {
    try {
      setIsLoading(true);
      const data = await AuthAPI.checkAuthStatus();
      setIsAuthenticated(data.authenticated);
      if (!data.authenticated) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
      }
      setError(null);
      return data.authenticated;
    } catch (err) {
      setIsAuthenticated(false);
      setAuthToken(null);
      return false;
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
        setAuthToken(data.token);
      }
      const authenticated = await checkAuth();
      return authenticated;
    } catch (err) {
      setError(err.message || 'Login failed');
      return false;
    }
  }

  async function handleLogout() {
    try {
      await AuthAPI.logout();
      await AsyncStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
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
