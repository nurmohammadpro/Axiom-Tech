import type { PosCatalogItem } from "./api";

/**
 * IndexedDB cache for the POS catalog so the till keeps working with a stale
 * snapshot when the network drops (planned Phase 3.1). Every successful server
 * fetch refreshes the cache, so it doubles as a background sync.
 */

const DB_NAME = "axiom-pos";
const STORE = "catalog";
/** Cache one snapshot per location so the offline fallback matches the till's view. */
function cacheKey(location?: string) {
  return location ? `catalog:${location}` : "catalog";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function cachePosCatalog(items: PosCatalogItem[], location?: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      // Store has no keyPath/key generator, so the key must be passed explicitly.
      tx.objectStore(STORE).put({ items, updatedAt: Date.now() }, cacheKey(location));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache is best-effort; never let a failed write break the caller.
  }
}

export async function readCachedPosCatalog(location?: string): Promise<{
  items: PosCatalogItem[];
  updatedAt: number;
} | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey(location));
      req.onsuccess = () => resolve(req.result?.items ? req.result : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export interface LoadResult {
  items: PosCatalogItem[];
  offline: boolean;
}

/** Load the catalog from the server (caching on success) or fall back to IndexedDB. */
export async function loadPosCatalog(location?: string): Promise<LoadResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cached = await readCachedPosCatalog(location);
    return { items: cached?.items ?? [], offline: true };
  }

  try {
    const url = location
      ? `/api/pos/catalog?location=${encodeURIComponent(location)}`
      : "/api/pos/catalog";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const items = (await res.json()) as PosCatalogItem[];
    void cachePosCatalog(items, location);
    return { items, offline: false };
  } catch {
    const cached = await readCachedPosCatalog(location);
    return { items: cached?.items ?? [], offline: true };
  }
}
