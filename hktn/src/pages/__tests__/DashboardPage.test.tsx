import { render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { vi } from 'vitest';
import type { DashboardResponse } from '../../types/dashboard';
import { DashboardPage } from '../DashboardPage';

vi.mock('../../state/useUser', () => ({
  useUser: () => ({
    userId: 'demo-user',
    userName: 'Demo',
    setInitialUserData: vi.fn(),
    clearUser: vi.fn(),
    consents: [],
    upsertConsent: vi.fn(),
    banks: [],
    refreshBanks: vi.fn(),
    isFetchingBanks: false,
  }),
}));

vi.mock('../../state/notifications', () => ({
  useNotifications: () => ({
    notify: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

const mockGetDashboard = vi.fn();
const mockGetFinancialPortrait = vi.fn();

vi.mock('../../api/client', () => ({
  getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
  getFinancialPortrait: (...args: unknown[]) => mockGetFinancialPortrait(...args),
}));

const dashboardStub: DashboardResponse = {
  safe_to_spend: 45000,
  safe_to_spend_daily: 1500,
  goal_probability: 82,
  current_balance: 120000,
  analysis: {
    payment_amount: 12000,
    payment_date: '2024-05-10',
    recommendation: 'Оплатите аренду заранее',
    color_zone: 'green',
    success_probability_percent: 78,
  },
  upcoming_payments: [
    {
      name: 'Аренда',
      amount: 40000,
      due_date: '2024-05-05',
      source: 'recurring_debit',
      mcc_code: '4900',
      category: 'utilities',
      merchant_name: 'Utility Co',
      bank_transaction_code: 'POS:RNT',
    },
    {
      name: 'Кредитная выплата',
      amount: 12000,
      due_date: '2024-05-12',
      source: 'credit_agreement',
      mcc_code: '0000',
      category: 'loan',
      merchant_name: 'Bank Loan',
    },
  ],
  recurring_events: [
    {
      name: 'Зарплата',
      amount: 90000,
      is_income: true,
      next_date: '2024-05-25',
      frequency_days: 30,
      mcc_code: '6011',
      category: 'salary',
      merchant_name: 'ACME Corp',
      bank_transaction_code: 'TRF:PAY',
      source: 'recurring_income',
    },
    {
      name: 'Коммунальные услуги',
      amount: -4000,
      is_income: false,
      next_date: '2024-05-07',
      frequency_days: 30,
      mcc_code: '4900',
      category: 'utilities',
      merchant_name: 'Utility Co',
      bank_transaction_code: 'POS:RNT',
      source: 'recurring_debit',
    },
  ],
  credit_rankings: [
    {
      name: 'Loan A',
      balance: 200000,
      min_payment: 12000,
      stress_score: 45,
    },
  ],
};

describe('DashboardPage', () => {
  beforeEach(() => {
    mockGetDashboard.mockResolvedValue(dashboardStub);
    mockGetFinancialPortrait.mockResolvedValue({
      recurring_events: dashboardStub.recurring_events,
      transactions_sample: [
        {
          transactionId: 'tx-1',
          amount: -4000,
          bookingDate: '2024-04-05',
          merchant: { name: 'Utility Co', mccCode: '4900' },
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders metadata badges for upcoming payments', () => {
    render(<DashboardPage initialData={dashboardStub} />);

    const mccBadges = screen.getAllByText(/MCC 4900/i);
    expect(mccBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('AI-обязательство')).toBeInTheDocument();
    expect(screen.getByText(/Баланс:/)).toBeInTheDocument();
  });

  it('filters upcoming payments by source', async () => {
    render(<DashboardPage initialData={dashboardStub} />);

    const sourceSelect = screen.getByLabelText('Источник');
    await act(async () => {
      await userEvent.selectOptions(sourceSelect, 'credit_agreement');
    });

    const paymentsSection = screen.getByRole('heading', { name: 'Предстоящие платежи' }).closest('.card');
    expect(paymentsSection).toBeTruthy();
    expect(within(paymentsSection as HTMLElement).getByText('Кредитная выплата')).toBeInTheDocument();
    expect(within(paymentsSection as HTMLElement).queryByText('Аренда')).not.toBeInTheDocument();
  });

  it('fetches financial portrait when details are expanded', async () => {
    render(<DashboardPage initialData={dashboardStub} />);

    const toggleButton = screen.getByRole('button', { name: /показать детали/i });
    await act(async () => {
      await userEvent.click(toggleButton);
    });

    await waitFor(() => expect(mockGetFinancialPortrait).toHaveBeenCalledWith({ user_id: 'demo-user' }));
    const portraitHeadings = await screen.findAllByText(/Повторяющиеся события/);
    expect(portraitHeadings.length).toBeGreaterThan(0);
    const utilityBadges = await screen.findAllByText(/Utility Co/);
    expect(utilityBadges.length).toBeGreaterThan(0);
  });
});
