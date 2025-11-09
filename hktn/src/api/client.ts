const API_BASE = import.meta.env.VITE_API_BASE ?? '';

type FetchOptions = RequestInit & { skipAuth?: boolean };

async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
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

export const startConsent = (payload: { user_id: string; bank_id: string }) =>
  fetchJson('/api/consents/start', { method: 'POST', body: JSON.stringify(payload) });

export const pollConsent = (params: { user_id: string; bank_id: string; request_id: string }) => {
  const query = new URLSearchParams({
    user_id: params.user_id,
    bank_id: params.bank_id,
    request_id: params.request_id,
  }).toString();
  return fetchJson(`/api/consents/status?${query}`);
};

export const getBankBootstrap = (bankId: string, userId: string) =>
  fetchJson(`/api/banks/${bankId}/bootstrap?user_id=${encodeURIComponent(userId)}`);

export const getPreview = (payload: { user_id: string }) =>
  fetchJson('/api/ingest/preview', { method: 'POST', body: JSON.stringify(payload) });

export const saveProductConsents = (payload: {
  user_id: string;
  items: Array<{ bank_id: string; product_id: string; product_type?: string; consented: boolean }>;
}) => fetchJson('/api/products/consent', { method: 'POST', body: JSON.stringify(payload) });

export const saveGoal = (payload: { user_id: string; goal_type: string; goal_details: Record<string, unknown> }) =>
  fetchJson('/api/profile/goal', { method: 'POST', body: JSON.stringify(payload) });

export const runIngestion = (payload: { user_id: string }) =>
  fetchJson('/api/ingest/run', { method: 'POST', body: JSON.stringify(payload) });

export const commitOnboarding = (payload: { user_id: string }) =>
  fetchJson('/api/onboarding/commit', { method: 'POST', body: JSON.stringify(payload) });

export const getDashboard = (userId: string) =>
  fetchJson(`/api/dashboard?user_id=${encodeURIComponent(userId)}`);

export const getCredits = (userId: string) =>
  fetchJson(`/api/credits?user_id=${encodeURIComponent(userId)}`);

export const getFinancialPortrait = (payload: { user_id: string }) =>
  fetchJson('/api/financial-portrait', { method: 'POST', body: JSON.stringify(payload) });

export type DashboardResponse = Awaited<ReturnType<typeof getDashboard>>;

export { fetchJson };
