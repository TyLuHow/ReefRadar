/**
 * The contract module's one public surface (02-07). Application code imports
 * from '@/features/contract' only; client.ts, schema.ts and config.ts are
 * internal and are not imported from outside this folder (tests excepted).
 */
export { useContract, useCoverage, useModelVersion, useReferenceSites } from './hooks';
export type { ContractQueryResult } from './hooks';
export { ContractVersionSync } from './ContractVersionSync';
export { ContractStampLine } from './ContractStampLine';
export { formatContractStamp, PRE_CONTRACT_LABEL } from './stamp';
export type { ContractStamp } from './stamp';
export { parseContractVersionParam, useContractVersionStore } from './version';
export type { ContractPin } from './version';
export { useLegacySitesResponse, useSiteIndex, toLegacySitesResponse } from './legacy';
export type { SiteIndexEntry } from './legacy';
export {
  ContractError,
  ContractConfigError,
  ContractFetchError,
  ContractIntegrityError,
  ContractNotFoundError,
  ContractSchemaError,
  ContractUriError,
  ContractVersionParamError,
} from './errors';
export type { ContractManifest, ContractPointer, ContractSite, Coverage, ModelVersion } from './schema';
