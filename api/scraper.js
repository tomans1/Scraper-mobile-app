import { apiRequest } from './client';

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
    body: JSON.stringify(filters),
  });
}

export async function getProgress() {
  return apiRequest('/progress');
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
  return fetch('https://web-production-ec52.up.railway.app/feedback', {
    method: 'POST',
    body: keyword,
    credentials: 'include',
  });
}

export async function checkServerHealth() {
  try {
    const response = await fetch('https://web-production-ec52.up.railway.app/health', {
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
    await fetch('https://web-production-ec52.up.railway.app/wake', {
      method: 'POST',
    });
    return true;
  } catch (err) {
    return false;
  }
}
