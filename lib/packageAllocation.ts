/**
 * Package-day allocation. A day care day costs one package day, but a package
 * balance can be fractional (a within-24h reschedule debits a half day as a
 * penalty — see lib/bookings.server.ts). So funding a day may draw a fraction
 * from one package, combine fractions across packages, or fall short and need
 * a cash top-up for whatever the packages don't cover.
 */

export interface PkgBalance {
  id: string;
  days_remaining: number;
}

/** Round to 1 decimal — package days are half-day granular; this guards against
 * floating-point drift accumulating across many allocations. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Greedily consume up to one full day from `packages` (which must be ordered
 * oldest-first), mutating each package's `days_remaining` in place.
 *
 * Returns:
 *  - `chargeFraction`: the portion of the day NOT covered by packages, to be
 *    charged as cash. 0 = fully covered, 0.5 = half covered, 1 = no package
 *    days available.
 *  - `consumed`: which packages contributed and how much (first entry is the
 *    "primary" package, used as the booking's customer_package_id).
 */
export function consumePackageDay(packages: PkgBalance[]): {
  chargeFraction: number;
  consumed: { id: string; amount: number }[];
} {
  let need = 1;
  const consumed: { id: string; amount: number }[] = [];
  for (const pkg of packages) {
    if (need <= 0) break;
    if (pkg.days_remaining <= 0) continue;
    const take = Math.min(need, pkg.days_remaining);
    pkg.days_remaining = round1(pkg.days_remaining - take);
    need = round1(need - take);
    consumed.push({ id: pkg.id, amount: take });
  }
  return { chargeFraction: need, consumed };
}
