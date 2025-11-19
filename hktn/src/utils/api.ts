const API_BASE_URL = 'http://localhost:8000';

export interface LoginRequest {
    user_id: string;
    user_name?: string;
}

export interface UserProfile {
    user_id: string;
    name: string;
    subscription_plan: 'free' | 'premium';
    is_active: boolean;
}

export interface LoginResponse {
    token: string;
    profile: UserProfile;
}

export async function loginUser(req: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
    });

    if (!response.ok) {
        throw new Error(`Login failed: ${response.statusText}`);
    }

    return response.json();
}

export async function getBanks(userId?: string): Promise<any> {
    const url = userId
        ? `${API_BASE_URL}/api/banks?user_id=${userId}`
        : `${API_BASE_URL}/api/banks`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch banks: ${response.statusText}`);
    }

    return response.json();
}

export async function getDashboard(userId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/dashboard?user_id=${userId}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch dashboard: ${response.statusText}`);
    }

    return response.json();
}

// Onboarding consents API
export interface ConsentStatus {
    status: "creating" | "pending" | "approved" | "error";
    consent_id?: string;
    request_id?: string;
    approval_url?: string;
    error_message?: string;
}

export interface ConsentProgressStatus {
    bank_id: string;
    bank_name: string;
    account_consent?: ConsentStatus;
    product_consent?: ConsentStatus;
    payment_consent?: ConsentStatus;
}

export interface CreateConsentsResponse {
    results: ConsentProgressStatus[];
    user_id: string;
    overall_status: "in_progress" | "completed" | "partial" | "error";
}

export async function createOnboardingConsents(
    user_id: string,
    banks: Array<{
        bank_id: string;
        consents: { account: boolean; product: boolean; payment: boolean };
    }>
): Promise<CreateConsentsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/consents`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            user_id,
            banks,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create consents: ${response.statusText}`);
    }

    return response.json();
}

export async function getConsentsStatus(user_id: string): Promise<ConsentProgressStatus[]> {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/consents/status?user_id=${user_id}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch consents status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results || [];
}

export async function finalizeOnboarding(
    onboarding_id: string,
    user_id: string
): Promise<{ status: string; ready: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/onboarding/finalize`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            onboarding_id,
            user_id,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to finalize onboarding: ${response.statusText}`);
    }

    return response.json();
}
