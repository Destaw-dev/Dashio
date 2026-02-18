import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Total Customers" value={1234} />);
    expect(screen.getByText('Total Customers')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('formats large numbers with locale', () => {
    render(<KpiCard label="Revenue" value={1000000} />);
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
  });
});
