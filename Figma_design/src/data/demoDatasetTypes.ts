// Types for demo dataset structure

export interface DemoBalance {
    amount: string;
    currency: string;
    type: string;
    creditDebitIndicator: 'Credit' | 'Debit';
}

export interface DemoAccount {
    accountId: string;
    status: string;
    currency: string;
    accountType: string;
    accountSubType: string;
    nickname?: string;
    openingDate?: string;
    bank: string;
    balance: DemoBalance;
}

export interface DemoTransactionAmount {
    amount: string;
    currency: string;
}

export interface DemoBankTransactionCode {
    code: string;
}

export interface DemoMerchant {
    merchantId: string;
    name: string;
    mccCode: string;
    category: string;
    city: string;
    country: string;
    address: string;
}

export interface DemoTransactionLocation {
    city: string;
    country: string;
}

export interface DemoCard {
    cardId: string;
    cardNumber: string;
    cardType: string;
    cardName: string;
}

export interface DemoTransaction {
    accountId: string;
    transactionId: string;
    amount: DemoTransactionAmount;
    creditDebitIndicator: 'Credit' | 'Debit';
    status: string;
    bookingDateTime: string;
    valueDateTime: string;
    transactionInformation: string;
    bankTransactionCode: DemoBankTransactionCode;
    merchant: DemoMerchant | null;
    transactionLocation: DemoTransactionLocation;
    card: DemoCard | null;
    counterparty: any | null;
}

export interface DemoAgreement {
    agreement_id: string;
    product_type: 'loan' | 'card' | 'deposit' | string;
    product_name: string;
    amount: number;
    status: string;
    start_date: string;
    end_date: string | null;
    interest_rate: number | null;
    bank: string;
}

export interface DemoUserRecord {
    id: string;
    original_client_id: string; // team260-3, team260-10
    fetched_at: string;
    name?: string; // May be added by compile script
    accounts: DemoAccount[];
    transactions: DemoTransaction[];
    agreements: DemoAgreement[];
}

export type DemoDataset = DemoUserRecord[];
