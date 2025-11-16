import type { DashboardResponse } from '../types/dashboard';
import type { IntegrationStatusResponse } from '../types/integration-status';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type FetchOptions = RequestInit & { skipAuth?: boolean };

async function fetchJson<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers);
  if (options.body && !headers.get('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        message = Array.isArray(payload.detail) ? payload.detail[0]?.msg ?? message : payload.detail;
      }
    } catch {
      // ignore JSON parse errors
    }
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export type BankResponse = {
  banks: Array<{
    id: string;
    name: string;
    connected: boolean;
    baseUrl?: string | null;
    status?: string;
    error?: string;
  }>;
};

export const getBanks = (userId?: string) => {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  return fetchJson<BankResponse>(`/api/banks${query}`);
};

export const getDashboard = (userId: string) =>
  fetchJson<DashboardResponse>(`/api/dashboard?user_id=${encodeURIComponent(userId)}`);

export const getIntegrationStatus = (userId: string) =>
  fetchJson<IntegrationStatusResponse>(`/api/integration-status?user_id=${encodeURIComponent(userId)}`);

export type { DashboardResponse, IntegrationStatusResponse };

export { fetchJson };
