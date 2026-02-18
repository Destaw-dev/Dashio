import { render, screen } from '@testing-library/react';
import { ChartCard } from './ChartCard';
import { ThemeProvider } from '@/providers/ThemeProvider';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('ChartCard', () => {
  it('shows title and empty message when series is empty', () => {
    renderWithTheme(
      <ChartCard
        title="New customers"
        description="Over time."
        query={{ isLoading: false, isError: false, data: { series: [] } }}
        emptyMessage="No data in range."
      />
    );
    expect(screen.getByText('New customers')).toBeInTheDocument();
    expect(screen.getByText('No data in range.')).toBeInTheDocument();
  });

  it('shows error message when query has error', () => {
    renderWithTheme(
      <ChartCard
        title="Activity"
        description="Trend."
        query={{ isLoading: false, isError: true }}
        emptyMessage="No data."
      />
    );
    expect(screen.getByText('Failed to load data.')).toBeInTheDocument();
  });
});
