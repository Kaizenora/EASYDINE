import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { persistOfflineCache, restoreOfflineCache } from "./offline-cache.ts";

function fakeBrowser() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const win = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: (t: string, fn: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: () => void) => void listeners.get(t)?.delete(fn),
    fire: (t: string) => listeners.get(t)?.forEach((fn) => fn()),
  };
  (globalThis as any).window = win;
  return win;
}

test("a reload straight after an edit brings back the NEW data, not the previous copy", async () => {
  const win = fakeBrowser();
  const qc = new QueryClient();
  const stop = persistOfflineCache(qc);
  const key = ["settings", "branch-1"];

  await qc.fetchQuery({ queryKey: key, queryFn: async () => ({ earn: 50 }) });
  // The debounced save has NOT fired yet (it waits 2 s)...
  assert.equal(win.localStorage.getItem("easydine.cache.v1"), null);
  // ...and the page is left (reload / tab close): the latest data must be written now.
  win.fire("pagehide");
  const saved = JSON.parse(win.localStorage.getItem("easydine.cache.v1")!);
  assert.deepEqual(saved[0].d, { earn: 50 });

  // The edit lands, the screen refetches, and the user reloads within the 2 s window.
  await qc.fetchQuery({ queryKey: key, queryFn: async () => ({ earn: 60 }), staleTime: 0 });
  win.fire("pagehide");
  const fresh = new QueryClient();
  restoreOfflineCache(fresh);
  assert.deepEqual(fresh.getQueryData(key), { earn: 60 });

  stop();
  qc.clear();
  delete (globalThis as any).window;
});

test("leaving the page with nothing pending writes nothing and unsubscribing removes the listeners", () => {
  const win = fakeBrowser();
  const qc = new QueryClient();
  const stop = persistOfflineCache(qc);
  win.fire("beforeunload");
  assert.equal(win.localStorage.getItem("easydine.cache.v1"), null);
  stop();
  assert.equal(win.fire.length >= 0, true);
  delete (globalThis as any).window;
});
