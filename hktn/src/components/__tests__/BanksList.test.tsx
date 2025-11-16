import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BanksList } from '../BanksList';
import type { BankSummary } from '../../state/useUser';

describe('BanksList', () => {
  it('renders empty state', () => {
    render(<BanksList banks={[]} />);
    expect(screen.getByText(/каталог банков пуст/i)).toBeInTheDocument();
  });

  it('shows connected status label', () => {
    const banks: BankSummary[] = [{ id: 'demo', name: 'Demo', connected: true }];
    render(<BanksList banks={banks} />);
    expect(screen.getByText(/уже подключён/i)).toBeInTheDocument();
  });
});
