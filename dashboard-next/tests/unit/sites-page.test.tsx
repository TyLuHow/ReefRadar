import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import sitesFixture from '../fixtures/api/sites.json';

vi.mock('@/lib/api', () => ({
  api: { getSites: vi.fn(async () => sitesFixture) },
}));

// The Leaflet map is irrelevant here (and not SSR/jsdom friendly).
vi.mock('@/components/maps', () => ({
  WorldMap: () => <div data-testid="world-map" />,
}));

import SitesPage from '@/app/sites/page';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SitesPage />
    </QueryClientProvider>
  );
}

describe('SitesPage filtering (REVIEW WR-16)', () => {
  it('shows "No sites match your filters" instead of every site when a filter matches none', async () => {
    renderPage();
    const search = await screen.findByPlaceholderText('Search sites...');
    expect(await screen.findAllByText(/aus_D1/)).not.toHaveLength(0);

    fireEvent.change(search, { target: { value: 'zzz-matches-nothing' } });

    await waitFor(() => expect(screen.getByText(/No sites match your filters/i)).toBeInTheDocument());
    expect(screen.queryByText(/aus_D1/)).not.toBeInTheDocument();
    // The counter reflects the real (empty) result.
    expect(screen.getAllByText(new RegExp(`0 of ${sitesFixture.sites.length}`)).length).toBeGreaterThan(0);

    // "Clear filters" restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getAllByText(/aus_D1/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/No sites match your filters/i)).not.toBeInTheDocument();
  });
});
