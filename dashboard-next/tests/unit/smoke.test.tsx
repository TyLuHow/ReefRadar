import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatStatus } from '@/lib/utils';

describe('formatStatus (via @ alias)', () => {
  it('renders a human-readable status string', () => {
    expect(formatStatus('restored_mid')).toBe('Restored Mid');
  });
});

describe('Testing Library smoke', () => {
  it('finds a trivial rendered element in the DOM', () => {
    render(<div>{formatStatus('restored_mid')}</div>);
    expect(screen.getByText('Restored Mid')).toBeInTheDocument();
  });
});
