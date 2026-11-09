const hits = new Map<string, { n: number; reset: number }>();

/**
 * Small in-memory limiter for login/signup (per process). With a single app
 * replica (the current Dokploy deploy) this is sufficient; if the platform is
 * ever scaled to multiple replicas, move the counters to Postgres.
 * Returns true when allowed.
 */
export function allow(key: string, max = 5, windowMs = 15 * 60 * 1000, now = Date.now()): boolean {
  prune(now);
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  cur.n += 1;
  return cur.n <= max;
}

export function clear(key: string) {
  hits.delete(key);
}

/** Drop expired windows so the map does not grow without bound. */
function prune(now: number) {
  if (hits.size < 512) return; // cheap below this size
  for (const [k, v] of hits) {
    if (v.reset < now) hits.delete(k);
  }
}
