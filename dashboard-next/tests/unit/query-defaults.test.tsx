/**
 * PLAT-10 (CAP-08): React Query caching is live through the real Providers tree.
 *
 * Renders the production <Providers> (not a hand-built QueryClient) and checks the
 * defaults it installs plus request de-duplication for a shared query key. The test is
 * written to survive 03-06 removing the decorative canvas and animation loop from
 * Providers: those collaborators are neutralised through browser-API stubs, never by
 * mocking their module paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient, type QueryObserverOptions } from '@tanstack/react-query';
import { Providers } from '@/app/providers';
import { installContractFetch, resetContractStore, type ContractFetchHandle } from './support/contract-fetch';

// ContractVersionSync (mounted inside Providers) reads the URL through useSearchParams.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

let captured: QueryObserverOptions | undefined;

function DefaultsProbe() {
  captured = useQueryClient().getDefaultOptions().queries as QueryObserverOptions | undefined;
  return <div data-testid="defaults-probe">ready</div>;
}

function SharedQuery({ id, queryFn }: { id: string; queryFn: () => Promise<string> }) {
  const { data } = useQuery({ queryKey: ['plat-10-shared-key'], queryFn });
  return <div data-testid={id}>{data ?? 'loading'}</div>;
}

describe('Providers React Query defaults (CAP-08)', () => {
  let handle: ContractFetchHandle;

  beforeEach(() => {
    captured = undefined;
    handle = installContractFetch({ latest: 1 });
    resetContractStore();
    // Providers today mounts an rAF animation loop and a canvas; neutralise them via
    // browser APIs so this works before and after 03-06 removes them.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  });

  afterEach(() => {
    handle.restore();
    resetContractStore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes staleTime 60000 and refetchOnWindowFocus false', async () => {
    render(
      <Providers>
        <DefaultsProbe />
      </Providers>
    );
    await screen.findByTestId('defaults-probe');

    expect(captured).toBeDefined();
    expect(captured?.staleTime).toBe(60000);
    expect(captured?.refetchOnWindowFocus).toBe(false);
  });

  it('calls the queryFn exactly once for two components sharing one query key', async () => {
    const queryFn = vi.fn(async () => 'shared-value');

    render(
      <Providers>
        <SharedQuery id="first" queryFn={queryFn} />
        <SharedQuery id="second" queryFn={queryFn} />
      </Providers>
    );

    await waitFor(() => {
      expect(screen.getByTestId('first')).toHaveTextContent('shared-value');
      expect(screen.getByTestId('second')).toHaveTextContent('shared-value');
    });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
