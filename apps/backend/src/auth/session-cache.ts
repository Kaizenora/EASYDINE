import type { SessionUser } from '@easydine/types';

// Short-lived memory of signed-in users (id -> SessionUser), so a request
// does not reload the user, role and every permission (about five queries
// one after another) when the same user made a request seconds ago. With the
// database in another region each of those queries costs a long round trip.
//
// Kept honest by clearing on every change to staff, roles or permission
// overrides (clearSessionCache), and by a short TTL for anything else, such
// as a timed permission override expiring. Per process: a second backend
// instance keeps its own copy, still bounded by the TTL.

export const SESSION_CACHE_TTL_MS = 15_000;
const MAX_ENTRIES = 2_000;

const cache = new Map<string, { user: SessionUser; at: number }>();

export function getCachedSession(userId: string, now: number = Date.now()): SessionUser | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (now - hit.at >= SESSION_CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return hit.user;
}

export function setCachedSession(user: SessionUser, now: number = Date.now()): void {
  if (cache.size >= MAX_ENTRIES) {
    // Drop the oldest entry (Map keeps insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(user.id, { user, at: now });
}

/** Forget one user, or everyone (role / permission changes can affect many). */
export function clearSessionCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
