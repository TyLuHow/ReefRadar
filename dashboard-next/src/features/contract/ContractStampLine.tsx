'use client';

import { useContract } from './hooks';
import { ContractNotFoundError } from './errors';
import { PRE_CONTRACT_LABEL, formatContractStamp, stampMismatches, stampVersion, type ContractStamp } from './stamp';

interface ContractStampLineProps extends ContractStamp {
  /** Render for a coloured banner (white text) instead of the default muted tone. */
  onColor?: boolean;
}

const MISMATCH_FIELD_LABEL = {
  dataset_version: 'dataset',
  model_version: 'model',
  preprocessing_spec_version: 'preprocessing',
} as const;

/**
 * One line stating the data-contract version an analysis result was produced
 * with. A stamped result resolves exactly that version (an explicit version
 * always wins over the latest pointer); a result with no stamp is labelled
 * "pre-contract" and makes no contract request. Never invents a version.
 */
export function ContractStampLine(props: ContractStampLineProps) {
  const version = stampVersion(props);
  return version === null ? <PreContractLine onColor={props.onColor} /> : <StampedLine {...props} version={version} />;
}

function lineProps(onColor?: boolean) {
  return onColor
    ? { className: 'text-white/70 text-xs mt-1' }
    : { className: 'text-xs mt-1', style: { color: 'var(--text-muted)' } };
}

function PreContractLine({ onColor }: { onColor?: boolean }) {
  return (
    <p {...lineProps(onColor)} data-testid="contract-stamp">
      {PRE_CONTRACT_LABEL}
    </p>
  );
}

function StampedLine({ version, onColor, ...stamp }: ContractStampLineProps & { version: number }) {
  const contract = useContract(version);
  const label = formatContractStamp(stamp);

  if (contract.error) {
    const detail = contract.error instanceof ContractNotFoundError ? 'not found' : 'could not be loaded';
    return (
      <p {...lineProps(onColor)} data-testid="contract-stamp">
        {label} ({detail})
      </p>
    );
  }

  const parts = [stamp.dataset_version, stamp.model_version, stamp.preprocessing_spec_version].filter(
    (value): value is string => typeof value === 'string' && value !== ''
  );
  const mismatches = contract.data ? stampMismatches(stamp, contract.data) : [];

  return (
    <p {...lineProps(onColor)} data-testid="contract-stamp">
      {label}
      {contract.data === undefined ? ' (resolving)' : ''}
      {parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}
      {mismatches.length > 0
        ? ` · differs from the published ${label.toLowerCase()} manifest: ${mismatches
            .map((field) => MISMATCH_FIELD_LABEL[field])
            .join(', ')}`
        : ''}
    </p>
  );
}
