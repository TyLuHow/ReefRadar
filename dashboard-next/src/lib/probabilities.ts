// Integer-percentage display helpers (D-12, TRUTH-06).
//
// The API returns raw model probabilities (a Partial<Record<ReefStatus, number>>
// over only the classes the deployed model actually has -- an interim 3-class
// model has no `restored_mid` key at all). This module turns that raw output
// into integer percentages that always sum to exactly 100, and picks which
// classes a component should render, without inventing a value for a class
// the model never produced.

/**
 * Largest-remainder rounding: renormalises the input by its own sum (so a
 * legacy multiplied payload whose probabilities no longer sum to 1 still
 * renders the same relative percentages as a fresh raw-softmax payload),
 * then distributes the rounding remainder to the entries with the largest
 * fractional part so the result always sums to exactly 100.
 *
 * - `{}` returns `{}`.
 * - An all-zero input returns all zeros (no division by zero).
 * - Ties in remainder are broken by original key order (Object.entries
 *   iteration order, i.e. insertion order of the input object).
 */
export function toIntegerPercentages<K extends string>(
  probabilities: Partial<Record<K, number>>
): Record<K, number> {
  const entries = Object.entries(probabilities) as [K, number][];

  if (entries.length === 0) {
    return {} as Record<K, number>;
  }

  const sum = entries.reduce((acc, [, v]) => acc + (v ?? 0), 0);

  if (!(sum > 0)) {
    const zeros = {} as Record<K, number>;
    for (const [key] of entries) zeros[key] = 0;
    return zeros;
  }

  const shares = entries.map(([key, value], index) => {
    const normalized = ((value ?? 0) / sum) * 100;
    const floor = Math.floor(normalized);
    return { key, index, floor, remainder: normalized - floor };
  });

  const flooredTotal = shares.reduce((acc, s) => acc + s.floor, 0);
  const remaining = Math.round(100 - flooredTotal);

  const byRemainderDesc = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index
  );

  const result = {} as Record<K, number>;
  for (const s of shares) result[s.key] = s.floor;
  for (let i = 0; i < remaining && i < byRemainderDesc.length; i++) {
    result[byRemainderDesc[i].key] += 1;
  }

  return result;
}

/**
 * Filters a canonical class order down to the classes actually present in
 * a (possibly partial) probabilities object, preserving the canonical
 * order. A class the model did not return (e.g. `restored_mid` on a
 * 3-class interim model) is simply absent -- never rendered as a zero row.
 */
export function presentClasses<K extends string>(
  probabilities: Partial<Record<K, number>> | null | undefined,
  order: readonly K[]
): K[] {
  if (!probabilities) return [];
  return order.filter((status) =>
    Object.prototype.hasOwnProperty.call(probabilities, status)
  );
}
