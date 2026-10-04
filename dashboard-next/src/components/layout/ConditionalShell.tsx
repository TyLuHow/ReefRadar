'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/layout/Footer';

/**
 * Hides Navbar and Footer on immersive routes like /experience, and on the dev-only /dev routes
 * (the design-system fixtures render their own chrome and must not show the legacy shell).
 */
export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isImmersive = pathname.startsWith('/experience') || pathname.startsWith('/dev');

  if (isImmersive) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
