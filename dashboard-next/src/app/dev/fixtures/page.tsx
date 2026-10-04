import { notFound } from 'next/navigation';

/**
 * Dev-only design-system fixtures (DS-08).
 *
 * NEXT_PUBLIC_DEV_FIXTURES is inlined at build time, so a build without the flag compiles the
 * condition to false and the dynamic import below is dead code: the fixtures chunk is never
 * emitted. notFound() alone would not be enough (the code would still ship), which is why the
 * import sits inside the flag check. CI proves the exclusion (scripts/check-dev-fixtures-excluded.mjs).
 * Never set the flag in Vercel.
 */
export default async function FixturesPage() {
  if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1') {
    const { FixturesApp } = await import('@/features/fixtures');
    return <FixturesApp />;
  }
  notFound();
}
