import { apiRequest, API_BASE } from './client';

const CATEGORIES = [
  'Byty',
  'Domy',
  'Nové projekty',
  'Garáže',
  'Hotely, reštaurácie',
  'Chalupy, Chaty',
  'Kancelárie',
  'Obchodné priestory',
  'Pozemky',
  'Sklady',
  'Záhrady',
  'Ostatné',
];

export function getCategories() {
  return CATEGORIES;
}

export async function startScrape(filters) {
  return apiRequest('/scrape', {
    method: 'POST',
    body: JSON.stringify({ ...filters, mode: filters.mode || 'new' }),
  });
}

export async function fetchResults(filters, options = {}) {
  const { latestOnly = false } = options;
  return apiRequest('/scrape', {
    method: 'POST',
    body: JSON.stringify({ ...filters, mode: latestOnly ? 'latest' : 'old' }),
  });
}

export async function getJobStatus() {
  return apiRequest('/job_status');
}

export async function cancelScrape() {
  return apiRequest('/cancel', {
    method: 'POST',
  });
}

export async function restartScraper() {
  return apiRequest('/restart', {
    method: 'POST',
  });
}

export async function sendFeedback(keyword) {
  return fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    body: keyword,
  });
}

export async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return false;
    }
    await response.json();
    return true;
  } catch (err) {
    return false;
  }
}

export async function wakeServer() {
  try {
    await fetch(`${API_BASE}/wake`, {
      method: 'POST',
    });
    return true;
  } catch (err) {
    return false;
  }
}
