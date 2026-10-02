/**
 * Contract stamp helpers (02-10, CONTRACT-04).
 *
 * An analysis result carries the data-contract version it was produced with
 * (stamped by the classifier, 02-05). Four states are distinguished and never
 * conflated (CR-01):
 *   - stamped:      contract_version is set; resolves exactly that version.
 *   - uncovered:    produced after the contract existed by a model that no
 *                   published contract covers (contract_version null, but the
 *                   running model's own version is known). Never "pre-contract".
 *   - unavailable:  the classifier could not load its bundled stamp
 *                   (stamp_status "load_failed"); the stamp state is unknown.
 *   - pre-contract: a genuinely legacy result with no stamp fields at all.
 * A version is never derived from any other field: a result with a
 * dataset_version but no contract_version is never shown as stamped.
 */

/** How the classifier resolved the stamp for a result (absent on legacy results). */
export type StampStatus = 'stamped' | 'uncovered' | 'load_failed';

export interface ContractStamp {
  contract_version?: number | null;
  dataset_version?: string | null;
  model_version?: string | null;
  preprocessing_spec_version?: string | null;
  stamp_status?: StampStatus | string | null;
}

/** What a legacy result (no stamp fields at all) is called on screen. */
export const PRE_CONTRACT_LABEL = 'pre-contract';

/** What a post-contract result not covered by any published contract is called on screen. */
export const UNCOVERED_LABEL = 'Not covered by a published contract';

/** What a result whose classifier could not load its stamp is called on screen. */
export const STAMP_UNAVAILABLE_LABEL = 'Version stamp unavailable';

export type StampState = 'stamped' | 'uncovered' | 'unavailable' | 'pre-contract';

/** The contract version of a stamp, or null when the result carries none. */
export function stampVersion(stamp: ContractStamp): number | null {
  const version = stamp.contract_version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null;
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Which of the four stamp states a result is in. */
export function stampState(stamp: ContractStamp): StampState {
  if (stampVersion(stamp) !== null) return 'stamped';
  if (stamp.stamp_status === 'load_failed') return 'unavailable';
  if (stamp.stamp_status === 'uncovered' || hasString(stamp.model_version)) return 'uncovered';
  return 'pre-contract';
}

/**
 * "Contract v1" for a stamped result, a distinct label for an uncovered or
 * unavailable stamp, and "pre-contract" only for a legacy result.
 */
export function formatContractStamp(stamp: ContractStamp): string {
  const state = stampState(stamp);
  if (state === 'stamped') return `Contract v${stampVersion(stamp)}`;
  if (state === 'uncovered') return UNCOVERED_LABEL;
  if (state === 'unavailable') return STAMP_UNAVAILABLE_LABEL;
  return PRE_CONTRACT_LABEL;
}

export type StampField = 'dataset_version' | 'model_version' | 'preprocessing_spec_version';

/**
 * The stamp fields whose value differs from the resolved manifest's. A stamp
 * field that is null or absent is not compared (nothing was claimed).
 */
export function stampMismatches(stamp: ContractStamp, manifest: Record<StampField, string>): StampField[] {
  const fields: StampField[] = ['dataset_version', 'model_version', 'preprocessing_spec_version'];
  return fields.filter((field) => {
    const claimed = stamp[field];
    return typeof claimed === 'string' && claimed !== manifest[field];
  });
}
