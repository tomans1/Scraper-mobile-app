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
        const authenticated = await checkAuth({ silent: true });
        if (!authenticated) {
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

  async function checkAuth(options = {}) {
    const { silent = false } = options;
    try {
      if (!silent) {
        setIsLoading(true);
      }
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
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  async function handleLogin(password) {
    try {
      setError(null);
      const data = await AuthAPI.login(password);
      if (data.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        setAuthToken(data.token);
        setIsAuthenticated(true);
        const authenticated = await checkAuth({ silent: true });
        return authenticated;
      }

      await AsyncStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setIsAuthenticated(false);
      return false;
    } catch (err) {
      setError(err.message || 'Login failed');
      await AsyncStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setIsAuthenticated(false);
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
