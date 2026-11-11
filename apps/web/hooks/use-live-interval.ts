import { pollIntervalFor } from "@/lib/poll-interval";
import { useRealtimeState } from "@/lib/realtime-status";

export function useLiveAwareInterval(fastMs: number, slowMs: number): number {
  return pollIntervalFor(useRealtimeState(), fastMs, slowMs);
}
