import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserIdForm } from '../UserIdForm';

describe('UserIdForm', () => {
  it('validates demo-XXX format', () => {
    const handleSubmit = vi.fn();
    render(<UserIdForm onSubmit={handleSubmit} />);

    const input = screen.getByLabelText(/user id/i);
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.click(screen.getByRole('button', { name: /продолжить/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('demo-XXX');
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
