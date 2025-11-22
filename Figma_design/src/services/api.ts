// API Client for backend communication
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export interface CardSummary {
    id: string;
    name: string;
    bank: string;
    balance: number;
    type: 'debit' | 'credit';
    limit?: number;
}

export interface BalanceSummary {
    currency: string;
    amount: number;
}

export interface DashboardMetrics {
    sts: number;
    mdp: number;
    adp: number;
    total_debt: number;
    total_debit_balance: number;
    cards: CardSummary[];
    balances: BalanceSummary[];
    data_as_of: string;
    banks_status: Record<string, { status: string; enabled: boolean }>;
    status?: string;
}

export interface BankInfo {
    bank_id: string;
    status: string;
    enabled: boolean;
    last_sync_at: string | null;
}

export interface ProfileData {
    user: {
        id: string;
        client_id: string;
        name: string;
        mode: string;
        created_at: string;
    };
    connected_banks: BankInfo[];
    subscription_plan: string;
}

export interface PaymentRequest {
    payment_type: 'mdp' | 'adp' | 'sdp';
    amount: number;
    source_account_id?: string;
    target_loan_id?: string;
}

// Payment response is now the updated DashboardMetrics
export type PaymentResponse = DashboardMetrics;

class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = API_BASE_URL;
    }

    // GET Dashboard metrics
    async getDashboard(userId: string): Promise<DashboardMetrics> {
        const response = await fetch(`${this.baseUrl}/dashboard?user_id=${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch dashboard: ${response.statusText}`);
        }

        return response.json();
    }

    // GET User profile
    async getProfile(userId: string): Promise<ProfileData> {
        const response = await fetch(`${this.baseUrl}/profile?user_id=${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch profile: ${response.statusText}`);
        }

        return response.json();
    }

    // GET Loans
    async getLoans(userId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/loans?user_id=${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch loans: ${response.statusText}`);
        }

        return response.json();
    }

    // GET Accounts
    async getAccounts(userId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/accounts?user_id=${userId}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch accounts: ${response.statusText}`);
        }

        return response.json();
    }

    // POST Sync Data - triggers metric calculation
    async syncData(userId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/sync?user_id=${userId}`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(`Failed to sync data: ${response.statusText}`);
        }

        return response.json();
    }

    // PUT Toggle bank enabled state
    async toggleBank(userId: string, bankId: string, enabled: boolean): Promise<{
        success: boolean;
        bank_id: string;
        enabled: boolean;
        metrics: DashboardMetrics;
    }> {
        const response = await fetch(
            `${this.baseUrl}/profile/banks/${bankId}/toggle?user_id=${userId}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ enabled }),
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to toggle bank: ${response.statusText}`);
        }

        return response.json();
    }

    // POST Execute payment
    async executePayment(userId: string, payment: PaymentRequest): Promise<PaymentResponse> {
        const response = await fetch(
            `${this.baseUrl}/payments/execute?user_id=${userId}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payment),
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to execute payment: ${response.statusText}`);
        }

        return response.json();
    }
}

// Export singleton instance
export const apiClient = new ApiClient();
