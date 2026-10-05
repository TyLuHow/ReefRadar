import { HABITAT_STATUSES, type HabitatStatus } from './status-shapes';

/**
 * countBy (DS-05, UI-SPEC "Legend (data-driven, with counts)"): how many of `items` fall in each
 * habitat status. The Legend and the StatusBand take the data and a status accessor and call this,
 * so a number on screen is always a count of the data shown and never a typed figure.
 *
 * The map has a key for every status in `HABITAT_STATUSES` order (degraded, restored early,
 * restored mid, healthy, unknown), zeros included, so a caller reads the fixed ordinal order by
 * iterating it. An item whose accessor returns something outside the five statuses is not counted
 * (the contract schema already refuses such a site).
 */
export function countBy<T>(items: readonly T[], accessor: (item: T) => HabitatStatus): Map<HabitatStatus, number> {
  const counts = new Map<HabitatStatus, number>(HABITAT_STATUSES.map((status) => [status, 0]));
  for (const item of items) {
    const status = accessor(item);
    const current = counts.get(status);
    if (current !== undefined) counts.set(status, current + 1);
  }
  return counts;
}
