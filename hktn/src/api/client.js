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
export const getDashboard = (userId) => fetchJson(`/api/dashboard?user_id=${encodeURIComponent(userId)}`);
export { fetchJson };
