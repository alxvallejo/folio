/**
 * Orders async requests: only the most recent user-initiated one may apply its result.
 * Background reloads call `snapshot()` (no bump) and are superseded by any later `begin()`.
 */
export function createRequestGuard() {
  let counter = 0;
  return {
    /** Starts a user-initiated request, superseding everything before it. */
    begin: () => ++counter,
    /** Token for a background request that must not supersede anything. */
    snapshot: () => counter,
    isCurrent: (token: number) => token === counter,
  };
}
