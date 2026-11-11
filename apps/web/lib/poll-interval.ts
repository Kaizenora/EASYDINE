// Polling is the safety net behind the realtime socket. While the socket is
// live, pushes already refresh these queries, so the fast poll is wasted
// traffic; when it is connecting or offline we poll fast again so staff never
// see stale data. (Pure so it can be unit-tested with `node --test`.)
export function pollIntervalFor(state: "connecting" | "live" | "offline", fastMs: number, slowMs: number): number {
  return state === "live" ? slowMs : fastMs;
}
