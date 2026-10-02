import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { installContractFetch, resetContractStore, setContractPin, type ContractFetchHandle } from './support/contract-fetch';

// The Leaflet map is irrelevant here (and not SSR/jsdom friendly).
vi.mock('@/components/maps', () => ({
  WorldMap: () => <div data-testid="world-map" />,
}));

import SitesPage from '@/app/sites/page';

/**
 * 02-09: the sites page reads its data only through the contract module. The
 * fetch harness serves the committed contract (54 sites) exactly as the CDN
 * would; nothing here mocks the legacy api module.
 */
const SITE_COUNT = 54;

let handle: ContractFetchHandle;
let client: QueryClient;

function renderPage() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SitesPage />
    </QueryClientProvider>
  );
}

/** Make the sites artifact answer 403 until `allow()` is called (a failing then recovering CDN). */
function failSitesArtifact() {
  const inner = globalThis.fetch;
  let failing = true;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (failing && url.endsWith('/v1/sites.json')) return new Response('', { status: 403 });
    return inner(input, init);
  }) as unknown as typeof fetch;
  return {
    allow() {
      failing = false;
    },
  };
}

describe('SitesPage on the contract', () => {
  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client?.clear();
    resetContractStore();
  });

  it('renders one card per contract site and never requests the legacy /sites endpoint', async () => {
    renderPage();
    expect(await screen.findAllByRole('heading', { level: 3, name: /^(ind|aus|ken|mal|mex|borabora|irma|sanctsound)_/ })).toHaveLength(
      SITE_COUNT
    );
    expect(handle.refused).toEqual([]);
    expect(handle.requests).toEqual(['contract/latest.json', 'contract/v1.json', 'v1/sites.json']);
  });

  it('shows the location and coordinates of ind_H1, borabora_tourist and irma_eastern_sambo', async () => {
    renderPage();
    const card = async (id: string) => {
      const heading = await screen.findByRole('heading', { level: 3, name: id });
      return heading.closest('.glass-panel') as HTMLElement;
    };
    const ind = await card('ind_H1');
    expect(ind).toHaveTextContent('South Sulawesi, Indonesia');
    expect(ind).toHaveTextContent('-4.9216, 119.3169');

    const bora = await card('borabora_tourist');
    expect(bora).toHaveTextContent('Bora-Bora, French Polynesia');

    // Missing from the old hard-coded table; the contract carries it.
    const irma = await card('irma_eastern_sambo');
    expect(irma).toHaveTextContent('Florida Keys, USA');
    expect(irma).toHaveTextContent('24.4915, -81.6625');
  });

  it('builds the Google Maps link from numbers only', async () => {
    renderPage();
    const heading = await screen.findByRole('heading', { level: 3, name: 'ind_H1' });
    const card = heading.closest('.glass-panel') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /more details/i }));
    const link = within(card).getByRole('link', { name: /view on google maps/i });
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps?q=-4.9216,119.316922');
  });

  it('shows loading skeletons, not the empty state, while the contract chain is pending', async () => {
    const inner = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await gate;
      return inner(input, init);
    }) as unknown as typeof fetch;

    const view = renderPage();
    expect(view.container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No sites match your filters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load sites/i)).not.toBeInTheDocument();

    release();
    expect(await screen.findByRole('heading', { level: 3, name: 'ind_H1' })).toBeInTheDocument();
  });

  it('shows the error state when sites.json is 403 and the retry button re-requests the contract', async () => {
    const flaky = failSitesArtifact();
    renderPage();
    expect(await screen.findByText(/Failed to load sites/i)).toBeInTheDocument();
    const before = handle.requests.filter((r) => r === 'v1/sites.json').length;

    flaky.allow();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { level: 3, name: 'ind_H1' })).toBeInTheDocument();
    expect(handle.requests.filter((r) => r === 'v1/sites.json').length).toBeGreaterThan(before);
    expect(screen.queryByText(/Failed to load sites/i)).not.toBeInTheDocument();
  });
});

describe('SitesPage filtering (REVIEW WR-16)', () => {
  beforeEach(() => {
    handle = installContractFetch({ latest: 1 });
    setContractPin({ kind: 'unpinned' });
  });
  afterEach(() => {
    handle.restore();
    client?.clear();
    resetContractStore();
  });

  it('shows "No sites match your filters" instead of every site when a filter matches none', async () => {
    renderPage();
    const search = await screen.findByPlaceholderText('Search sites...');
    expect(await screen.findAllByText(/aus_D1/)).not.toHaveLength(0);

    fireEvent.change(search, { target: { value: 'zzz-matches-nothing' } });

    await waitFor(() => expect(screen.getByText(/No sites match your filters/i)).toBeInTheDocument());
    expect(screen.queryByText(/aus_D1/)).not.toBeInTheDocument();
    // The counter reflects the real (empty) result.
    expect(screen.getAllByText(new RegExp(`0 of ${SITE_COUNT}`)).length).toBeGreaterThan(0);

    // "Clear filters" restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getAllByText(/aus_D1/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/No sites match your filters/i)).not.toBeInTheDocument();
  });
});
