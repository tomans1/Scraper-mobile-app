export const API_BASE = 'https://web-production-ec52.up.railway.app';

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (global.authToken) {
    headers['Authorization'] = `Bearer ${global.authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? 'include',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}
