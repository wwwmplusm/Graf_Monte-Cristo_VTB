import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BanksList } from '../BanksList';
import type { BankSummary } from '../../state/useUser';

describe('BanksList', () => {
  it('renders empty state', () => {
    const onConnect = vi.fn();
    render(<BanksList banks={[]} onConnect={onConnect} />);
    expect(screen.getByText(/каталог банков пуст/i)).toBeInTheDocument();
  });

  it('disables button when already connected', () => {
    const onConnect = vi.fn();
    const banks: BankSummary[] = [{ id: 'demo', name: 'Demo', connected: true }];
    render(<BanksList banks={banks} onConnect={onConnect} />);
    expect(screen.getByRole('button', { name: /готово/i })).toBeDisabled();
  });
});
