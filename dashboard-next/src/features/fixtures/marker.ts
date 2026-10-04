/**
 * A string that exists only inside fixture code. FixturesApp renders it as data-fixtures-marker, so
 * it ships in a build only when NEXT_PUBLIC_DEV_FIXTURES=1 pulled the fixtures in. The CI script
 * scripts/check-dev-fixtures-excluded.mjs reads this value from this file and fails if it appears
 * anywhere in a flag-less production build.
 */
export const DEV_FIXTURES_MARKER = 'reefradar-dev-fixtures-surface-7f3c';
