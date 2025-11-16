import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import type { DashboardResponse } from '../../types/dashboard';
import { DashboardPage } from '../DashboardPage.tsx';

const dashboardStub: DashboardResponse = {
  total_balance: 150000,
  bank_statuses: [
    { bank_id: 'vbank', bank_name: 'VBank', status: 'ok', fetched_at: new Date().toISOString() },
    { bank_id: 'abank', bank_name: 'ABank', status: 'error', fetched_at: null },
  ],
  safe_to_spend_daily: 3500,
  salary_amount: 80000,
  next_salary_date: '2025-12-25',
  days_until_next_salary: 10,
  upcoming_credit_payment: {
    amount: 12000,
    next_payment_date: '2025-12-18',
  },
};

vi.mock('../../state/useUser', () => ({
  useUser: () => ({
    userId: 'demo-user',
  }),
}));

const notifyError = vi.fn();

vi.mock('../../state/notifications', () => ({
  useNotifications: () => ({
    notifyError,
  }),
}));

const mockGetDashboard = vi.fn();

vi.mock('../../api/client', () => ({
  getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mockGetDashboard.mockResolvedValue(dashboardStub);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders Safe-to-Spend metric with salary metadata', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalledWith('demo-user'));

    expect(screen.getByRole('heading', { name: /Safe-to-Spend/i })).toBeInTheDocument();
    expect(screen.getByText(/3.?500/)).toBeInTheDocument();
    expect(screen.getByText(/Зарплата:/i)).toBeInTheDocument();
    expect(screen.getByText(/Ближайший платёж по кредиту/i)).toBeInTheDocument();
  });

  it('renders the bank overview card with each status', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());

    expect(screen.getByRole('heading', { name: /Баланс и источники данных/i })).toBeInTheDocument();
    expect(screen.getByText('VBank')).toBeInTheDocument();
    expect(screen.getByText('ABank')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Ошибка')).toBeInTheDocument();
  });

  it('shows an error notification if the API call fails', async () => {
    const error = new Error('API is down');
    mockGetDashboard.mockRejectedValueOnce(error);
    render(<DashboardPage />);
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Не удалось загрузить данные для дашборда.'),
    );
  });
});
