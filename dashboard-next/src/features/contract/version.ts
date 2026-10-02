import { create } from 'zustand';

/**
 * Which contract version the URL asks for (02-08, CONTRACT-04).
 *
 * `?cv=N` pins exactly version N; no parameter follows latest.json. The raw
 * string from the URL is never concatenated into a request path: it either
 * parses to a plain integer of one to six digits or it is `invalid`, and only
 * the parsed integer reaches URL construction (T-02-08-01).
 */

export type ContractPin =
  | { kind: 'unpinned' }
  | { kind: 'pinned'; version: number }
  | { kind: 'invalid'; raw: string };

const VERSION_PATTERN = /^[1-9]\d{0,5}$/;

export function parseContractVersionParam(raw: string | null): ContractPin {
  if (raw === null) return { kind: 'unpinned' };
  if (!VERSION_PATTERN.test(raw)) return { kind: 'invalid', raw };
  return { kind: 'pinned', version: Number(raw) };
}

interface ContractVersionState {
  /** False until the URL has been read; contract queries stay disabled until then. */
  resolved: boolean;
  pin: ContractPin;
  setPin: (pin: ContractPin) => void;
  reset: () => void;
}

export const useContractVersionStore = create<ContractVersionState>((set) => ({
  resolved: false,
  pin: { kind: 'unpinned' },
  setPin: (pin) => set({ resolved: true, pin }),
  reset: () => set({ resolved: false, pin: { kind: 'unpinned' } }),
}));

/** How much of a user-supplied value may be echoed back to the visitor. */
const MAX_ECHO = 40;

export function echoParam(raw: string): string {
  return raw.length > MAX_ECHO ? `${raw.slice(0, MAX_ECHO)}...` : raw;
}
