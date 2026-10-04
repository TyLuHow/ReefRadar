/**
 * The registered /dev/fixtures section slugs, in UI-SPEC section order (T-04-07-01).
 *
 * This file has no imports on purpose: the single-section page imports it directly (never the
 * barrel or the registry) for generateStaticParams and the slug check, so the route list is known
 * without pulling any fixture code into a build made without NEXT_PUBLIC_DEV_FIXTURES=1. Each later
 * primitive plan appends its slug here and its entry to registry.tsx; tests/unit/fixtures-registry
 * keeps the two lists equal and in order.
 */
export const FIXTURE_SLUGS: readonly string[] = ['tokens', 'status-palette', 'button', 'dialog', 'toggle-group', 'tooltip', 'states', 'numerals'];

/** True for a registered slug only; everything else, including inherited object keys, is false. */
export function isFixtureSlug(slug: string): boolean {
  return FIXTURE_SLUGS.includes(slug);
}
