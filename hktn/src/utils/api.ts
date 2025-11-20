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

export interface STSToday {
    amount: number;
    spent: number;
    tomorrow: {
        amount: number;
        impact: string;
    };
}

export interface LoanSummary {
    total_outstanding: number;
    mandatory_daily_payment: number;
    additional_daily_payment: number;
    total_monthly_payment: number;
}

export interface SavingsSummary {
    total_saved: number;
    daily_payment: number;
    target: number;
    progress_percent: number;
}

export interface HealthScore {
    value: number;
    status: 'excellent' | 'good' | 'fair' | 'poor';
    reasons?: string[];
}

export interface BankStatus {
    bank_id: string;
    bank_name: string;
    status: 'ok' | 'error';
    fetched_at?: string;
}

export interface CacheInfo {
    is_cached: boolean;
    calculated_at: string | null;
    age_minutes: number | null;
}

export interface DataFreshness {
    bank_id: string;
    fetched_at: string;
    age_minutes: number;
}

export interface DashboardResponse {
    sts_today: STSToday;
    loan_summary: LoanSummary;
    savings_summary: SavingsSummary;
    total_debit_cards_balance: number;
    events_next_30d: Array<{
        date: string;
        type: string;
        amount: number;
        description: string;
    }>;
    health_score: HealthScore;
    bank_statuses: BankStatus[];
    user_mode: 'loans' | 'deposits';
    cache_info: CacheInfo;
    data_freshness: DataFreshness[];
}

export async function getDashboard(userId: string, forceRefresh: boolean = false): Promise<DashboardResponse> {
    const params = new URLSearchParams({ user_id: userId });
    if (forceRefresh) {
        params.append('force_refresh', 'true');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/dashboard?${params}`);

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

export async function checkUserHasLoans(user_id: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard?user_id=${user_id}`);
        
        if (!response.ok) {
            // Если dashboard недоступен, возвращаем false (безопасное значение)
            return false;
        }

        const data = await response.json();
        const loanSummary = data.loan_summary || {};
        const totalOutstanding = loanSummary.total_outstanding || 0;
        
        // Проверяем наличие кредитов или кредитных карт
        return totalOutstanding > 0;
    } catch (error) {
        console.error("Failed to check loans:", error);
        // В случае ошибки возвращаем false (безопасное значение)
        return false;
    }
}

export async function getTotalLoanAmount(user_id: string): Promise<number> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard?user_id=${user_id}`);
        
        if (!response.ok) {
            console.error("Dashboard API returned error:", response.status, response.statusText);
            return 0;
        }

        const data = await response.json();
        const loanSummary = data.loan_summary || {};
        const totalOutstanding = loanSummary.total_outstanding || 0;
        
        console.log("Total loan amount from API:", totalOutstanding, "| User mode:", data.user_mode);
        
        // Возвращаем сумму всех кредитов
        return totalOutstanding;
    } catch (error) {
        console.error("Failed to get total loan amount:", error);
        // В случае ошибки возвращаем 0 (безопасное значение)
        return 0;
    }
}

// Loans API
export interface Loan {
    id: string;
    bank: string;
    type: string;
    balance: number;
    rate: number;
    monthly_payment: number;
    priority: number;
    is_refi_candidate?: boolean;
    maturity_date?: string;
}

export interface LoansResponse {
    status: string;
    loans: Loan[];
    total_outstanding: number;
    mdp: number;
    adp: number;
    strategy: string;
}

export async function getLoans(user_id: string): Promise<LoansResponse> {
    const response = await fetch(`${API_BASE_URL}/api/loans?user_id=${user_id}`);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch loans: ${response.statusText}`);
    }
    
    return response.json();
}

// Deposits API
export interface Deposit {
    id: string;
    bank: string;
    type: string;
    balance: number;
    rate: number;
    term_months: number;
    maturity_date?: string;
}

export interface DepositsResponse {
    status: string;
    deposits: Deposit[];
    total_saved: number;
    sdp: number;
    target: number;
    progress_percent: number;
}

export async function getDeposits(user_id: string): Promise<DepositsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/deposits?user_id=${user_id}`);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch deposits: ${response.statusText}`);
    }
    
    return response.json();
}

// Refinance API
export interface RefinanceOffer {
    id: string;
    bank: string;
    rate: number;
    term_months: number;
    strategy: string;
    monthly_payment: number;
    savings: number;
    loan_amount: number;
    commission: number;
    breakeven_months: number;
}

export interface RefinanceResponse {
    status: string;
    offers: RefinanceOffer[];
    financing_needed: boolean;
    urgency: string;
    triggers: string[];
}

export async function getRefinanceOffers(user_id: string): Promise<RefinanceResponse> {
    const response = await fetch(`${API_BASE_URL}/api/refinance/optimize-loans?user_id=${user_id}`);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch refinance offers: ${response.statusText}`);
    }
    
    return response.json();
}

export interface RefinanceApplicationRequest {
    user_id: string;
    offer_id: string;
    loan_ids: string[];
    phone: string;
}

export interface RefinanceApplicationResponse {
    status: string;
    application_id?: string;
    message: string;
}

export async function applyRefinance(req: RefinanceApplicationRequest): Promise<RefinanceApplicationResponse> {
    const response = await fetch(`${API_BASE_URL}/api/refinance/apply`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
    });
    
    if (!response.ok) {
        throw new Error(`Failed to submit refinance application: ${response.statusText}`);
    }
    
    return response.json();
}
