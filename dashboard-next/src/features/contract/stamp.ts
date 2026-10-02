/**
 * Contract stamp helpers (02-10, CONTRACT-04).
 *
 * An analysis result carries the data-contract version it was produced with
 * (stamped by the router, 02-05). A result without a stamp was produced before
 * stamping and is labelled "pre-contract". A version is never derived from any
 * other field: a result with a dataset_version but no contract_version is still
 * "pre-contract".
 */

export interface ContractStamp {
  contract_version?: number | null;
  dataset_version?: string | null;
  model_version?: string | null;
  preprocessing_spec_version?: string | null;
}

/** What a result without a contract stamp is called on screen. */
export const PRE_CONTRACT_LABEL = 'pre-contract';

/** The contract version of a stamp, or null when the result carries none. */
export function stampVersion(stamp: ContractStamp): number | null {
  const version = stamp.contract_version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null;
}

/** "Contract v1" for a stamped result, "pre-contract" for one produced before stamping. */
export function formatContractStamp(stamp: ContractStamp): string {
  const version = stampVersion(stamp);
  return version === null ? PRE_CONTRACT_LABEL : `Contract v${version}`;
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
