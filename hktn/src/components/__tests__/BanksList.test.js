import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BanksList } from '../BanksList';
describe('BanksList', () => {
    it('renders empty state', () => {
        const onConnect = vi.fn();
        render(_jsx(BanksList, { banks: [], onConnect: onConnect }));
        expect(screen.getByText(/каталог банков пуст/i)).toBeInTheDocument();
    });
    it('disables button when already connected', () => {
        const onConnect = vi.fn();
        const banks = [{ id: 'demo', name: 'Demo', connected: true }];
        render(_jsx(BanksList, { banks: banks, onConnect: onConnect }));
        expect(screen.getByRole('button', { name: /готово/i })).toBeDisabled();
    });
});
