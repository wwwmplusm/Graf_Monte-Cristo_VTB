import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import type { DashboardResponse } from '../../types/dashboard';
import { DashboardPage } from '../DashboardPage';

const dashboardStub: DashboardResponse = {
  current_balance: 120000,
  safe_to_spend_daily: 1500,
  goal_probability: 82,
  total_debt: 450000,
  health_score: 72,
  upcoming_payments: [
    { name: 'Аренда', amount: 40000, due_date: '2024-05-05' },
    { name: 'Кредитная выплата', amount: 12000, due_date: '2024-05-12' },
  ],
  recurring_events: [
    { name: 'Зарплата', amount: 90000, is_income: true, next_date: '2024-05-25' },
    { name: 'Коммунальные услуги', amount: -4000, is_income: false, next_date: '2024-05-07' },
  ],
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

  it('renders Safe-to-Spend metric and goal probability', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalledWith('demo-user'));
    expect(screen.getByRole('heading', { name: /Safe-to-Spend/i })).toBeInTheDocument();
    expect(screen.getByText(/1.?500/)).toBeInTheDocument(); // formatted value (handles nbsp)
    expect(screen.getByText(/82%/)).toBeInTheDocument();
  });

  it('shows upcoming obligations and recurring events', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    expect(screen.getByText('Аренда')).toBeInTheDocument();
    expect(screen.getByText('Кредитная выплата')).toBeInTheDocument();
    expect(screen.getByText('Зарплата')).toBeInTheDocument();
    expect(screen.getByText('Коммунальные услуги')).toBeInTheDocument();
  });

  it('falls back to error notification when request fails', async () => {
    const error = new Error('boom');
    mockGetDashboard.mockRejectedValueOnce(error);
    render(<DashboardPage />);
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
  });
});
