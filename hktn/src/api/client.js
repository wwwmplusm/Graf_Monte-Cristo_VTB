const API_BASE = import.meta.env.VITE_API_BASE ?? '';
async function fetchJson(path, options = {}) {
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
        }
        catch {
            // ignore JSON parse errors
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    if (response.status === 204) {
        return {};
    }
    return (await response.json());
}
export const getBanks = (userId) => {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return fetchJson(`/api/banks${query}`);
};
export const startConsent = (payload) => fetchJson('/api/consents/start', { method: 'POST', body: JSON.stringify(payload) });
export const startProductConsent = (payload) => fetchJson('/api/consent/initiate/product', { method: 'POST', body: JSON.stringify(payload) });
export const pollConsent = (params) => {
    const query = new URLSearchParams({
        user_id: params.user_id,
        bank_id: params.bank_id,
        request_id: params.request_id,
    }).toString();
    return fetchJson(`/api/consents/status?${query}`);
};
export const getBankBootstrap = (bankId, userId) => fetchJson(`/api/banks/${bankId}/bootstrap?user_id=${encodeURIComponent(userId)}`);
export const getPreview = (payload) => fetchJson('/api/ingest/preview', { method: 'POST', body: JSON.stringify(payload) });
export const saveProductConsents = (payload) => fetchJson('/api/products/consent', { method: 'POST', body: JSON.stringify(payload) });
export const saveGoal = (payload) => fetchJson('/api/profile/goal', { method: 'POST', body: JSON.stringify(payload) });
export const runIngestion = (payload) => fetchJson('/api/ingest/run', { method: 'POST', body: JSON.stringify(payload) });
export const commitOnboarding = (payload) => fetchJson('/api/onboarding/commit', { method: 'POST', body: JSON.stringify(payload) });
export const getDashboard = (userId) => fetchJson(`/api/dashboard?user_id=${encodeURIComponent(userId)}`);
export const getCredits = (userId) => fetchJson(`/api/credits?user_id=${encodeURIComponent(userId)}`);
export const getFinancialPortrait = (payload) => fetchJson('/api/financial-portrait', { method: 'POST', body: JSON.stringify(payload) });
export { fetchJson };
