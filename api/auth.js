import { apiRequest } from './client';

export async function login(password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function checkAuthStatus() {
  return apiRequest('/auth/status');
}

export async function logout() {
  return apiRequest('/auth/logout', {
    method: 'POST',
  });
}
