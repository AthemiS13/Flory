// Centralized configuration for the ESP32 host used by API routes.
// Edit the default below or set ESP_HOST in the environment to override.
export const ESP_HOST = process.env.ESP_HOST || '192.168.0.27';
export const ESP_BASE = `http://${ESP_HOST}`;

export function espUrl(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  return `${ESP_BASE}${path}`;
}

export const ENDPOINTS = {
  settings: '/api/settings',
  pump: '/api/pump',
  status: '/api/status',
};

// Convenience wrapper used by some routes — keeps a single place to change how
// we call the ESP (and allows adding retries/fallbacks later).
export async function fetchEsp(path: string, init?: RequestInit) {
  return fetch(espUrl(path), init);
}
