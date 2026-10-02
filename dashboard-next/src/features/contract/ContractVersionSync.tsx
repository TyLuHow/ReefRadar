'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useContract } from './hooks';
import { echoParam, parseContractVersionParam, useContractVersionStore } from './version';
import { ContractNotFoundError } from './errors';

/**
 * Reads ?cv= once, in the smallest possible leaf (02-08, CONTRACT-04).
 *
 * useSearchParams opts the component that calls it out of static prerendering,
 * so this is the only component that calls it and Providers wraps it in
 * Suspense; every route still prerenders around it.
 *
 * It does three things, none of which changes the page's appearance when the
 * contract resolves:
 *   1. copies the parsed pin into the version store, which every contract hook
 *      waits for before making a request;
 *   2. marks the document with the version actually in use and whether it was
 *      pinned (html data-contract-version / data-contract-pinned), so a test,
 *      a bug report or a screenshot can say which contract it saw;
 *   3. renders a visible alert, and nothing else, when the pin is malformed or
 *      the pinned version does not exist. It never substitutes the latest
 *      contract for a version the visitor asked for.
 */
export function ContractVersionSync() {
  const searchParams = useSearchParams();
  const raw = searchParams.get('cv');
  const setPin = useContractVersionStore((state) => state.setPin);
  const resolved = useContractVersionStore((state) => state.resolved);
  const pin = useContractVersionStore((state) => state.pin);

  useEffect(() => {
    setPin(parseContractVersionParam(raw));
  }, [raw, setPin]);

  const { data: manifest, error } = useContract();
  const version = manifest?.contract_version;
  const pinned = pin.kind === 'pinned';

  useEffect(() => {
    if (!resolved) return;
    const root = document.documentElement;
    root.dataset.contractPinned = String(pinned);
    if (version !== undefined) {
      root.dataset.contractVersion = String(version);
    } else if (error !== null) {
      delete root.dataset.contractVersion;
    }
  }, [resolved, pinned, version, error]);

  if (!resolved) return null;

  let message: string | null = null;
  if (pin.kind === 'invalid') {
    message = `?cv=${echoParam(pin.raw)} is not a valid contract version. Use a whole number such as ?cv=1. No other version has been shown in its place.`;
  } else if (pin.kind === 'pinned' && error instanceof ContractNotFoundError) {
    message = `Requested contract version ${pin.version} was not found. No other version has been shown in its place.`;
  }
  if (message === null) return null;

  return (
    <div
      role="alert"
      className="glass-panel fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 p-4 text-sm"
      style={{ color: 'var(--text-primary)' }}
    >
      {message}
    </div>
  );
}
