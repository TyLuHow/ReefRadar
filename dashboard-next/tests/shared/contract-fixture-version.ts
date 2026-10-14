/**
 * The flipped-flag test fixture is contract version 99, a sentinel that can never be a
 * real published contract version (a real v2 is published in Phase 5).
 *
 * Mirrors FIXTURE_CONTRACT_VERSION in scripts/contract_lib.py; scripts/check_contract.py
 * and the Python fixture test keep the committed files consistent with that constant.
 * This file has no imports so both Vitest support code and Playwright support code can
 * import it.
 */
export const FIXTURE_CONTRACT_VERSION = 99;

/** Contract-relative path of the fixture manifest (served from contracts/fixtures/bucket). */
export const FIXTURE_MANIFEST_PATH = `contract/v${FIXTURE_CONTRACT_VERSION}.json`;
