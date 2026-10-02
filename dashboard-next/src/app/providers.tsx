'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useVitality } from '@/hooks/useVitality';
import { ContractVersionSync } from '@/features/contract';

const BackgroundCanvas = dynamic(
  () => import('@/components/BackgroundCanvas').then(m => m.BackgroundCanvas),
  { ssr: false }
);

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

  // Start vitality animation loop -- writes --reef-* CSS variables via rAF
  useVitality();

  return (
    <QueryClientProvider client={queryClient}>
      <BackgroundCanvas />
      {/* useSearchParams lives only in this leaf; Suspense keeps every route statically prerenderable. */}
      <Suspense fallback={null}>
        <ContractVersionSync />
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
