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
