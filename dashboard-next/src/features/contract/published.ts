/**
 * manifest sha256 of every contract version published at build time (WR-02).
 *
 * Published versions are immutable, so a pinned (?cv=N) or stamp-resolved
 * manifest has a hash the bundle can vouch for even though no pointer names it.
 * A version missing from this map (published after this build) is still
 * served, but flagged unverified rather than silently trusted.
 *
 * Mirrors contracts/PUBLISHED.json. tests/unit/contract-published.test.ts fails
 * when the two disagree, so adding a published version means adding it here.
 */
export const PUBLISHED_MANIFEST_SHA256: Readonly<Record<number, string>> = {
  1: 'c9d520addac040f4e7f2c74dce2678e4b3365779f176f8f90a004bf04db7bcb2',
};
