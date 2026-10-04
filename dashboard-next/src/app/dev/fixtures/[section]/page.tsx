import { notFound } from 'next/navigation';
import { FIXTURE_SLUGS, isFixtureSlug } from '@/features/fixtures/slugs';

/**
 * One fixtures section on its own page (isolated screenshots and axe), DS-08.
 *
 * Gated exactly like the index page: NEXT_PUBLIC_DEV_FIXTURES is inlined at build time, so a build
 * without the flag compiles the condition to false and the dynamic import is dead code; the fixture
 * code is never emitted and every section URL answers 404 (T-04-07-02, proven by
 * scripts/check-dev-fixtures-excluded.mjs). The slug check runs first, and turning dynamicParams off
 * keeps any slug outside generateStaticParams a 404 (T-04-07-01). The slugs come from slugs.ts,
 * which has no imports, so this file never reaches the fixtures barrel outside the flag check.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return FIXTURE_SLUGS.map((section) => ({ section }));
}

export default async function FixtureSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isFixtureSlug(section)) notFound();
  if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1') {
    const { FixturesApp } = await import('@/features/fixtures');
    return <FixturesApp section={section} />;
  }
  notFound();
}
