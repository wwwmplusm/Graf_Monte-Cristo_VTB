import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BanksList } from '../BanksList';
describe('BanksList', () => {
    it('renders empty state', () => {
        render(_jsx(BanksList, { banks: [] }));
        expect(screen.getByText(/каталог банков пуст/i)).toBeInTheDocument();
    });
    it('shows connected status label', () => {
        const banks = [{ id: 'demo', name: 'Demo', connected: true }];
        render(_jsx(BanksList, { banks: banks }));
        expect(screen.getByText(/уже подключён/i)).toBeInTheDocument();
    });
});
