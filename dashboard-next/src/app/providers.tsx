'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { ContractVersionSync } from '@/features/contract';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* useSearchParams lives only in this leaf; Suspense keeps every route statically prerenderable. */}
      <Suspense fallback={null}>
        <ContractVersionSync />
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
