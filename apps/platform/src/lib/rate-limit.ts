const hits = new Map<string, { n: number; reset: number }>();

/** Small in-memory limiter for the login form (single instance). Returns true when allowed. */
export function allow(key: string, max = 5, windowMs = 15 * 60 * 1000, now = Date.now()): boolean {
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
