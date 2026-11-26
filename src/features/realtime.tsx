"use client";
/**
 * Browser side of realtime: one EventSource per tab on /api/stream. Events carry ids
 * only; they invalidate cached queries (which re-fetch through the authorized API) and
 * are re-broadcast as a window event for screens that hold local state (open chats).
 * EventSource reconnects automatically (server sends `retry: 3000`); while disconnected,
 * screens fall back to their polling intervals.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const REALTIME_EVENT = "isc:realtime";

let connected = false;
const listeners = new Set<() => void>();
function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  if (typeof document !== "undefined") document.documentElement.dataset.realtime = v ? "connected" : "disconnected";
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribe, () => connected, () => false);
}

export function RealtimeBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/stream");
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));
    const handle = (type: string) => (ev: MessageEvent) => {
      let data: { conversationId?: string } = {};
      try {
        data = JSON.parse(ev.data || "{}");
      } catch {
        /* ignore malformed */
      }
      window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: { type, ...data } }));
      qc.invalidateQueries({ queryKey: ["badges"] });
      if (type === "notification") {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["follow-requests"] });
        return;
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (data.conversationId) qc.invalidateQueries({ queryKey: ["conversation", data.conversationId] });
    };
    const types = ["message", "conversation", "read", "notification"] as const;
    const handlers = types.map((t) => [t, handle(t)] as const);
    for (const [t, h] of handlers) es.addEventListener(t, h as EventListener);
    return () => {
      for (const [t, h] of handlers) es.removeEventListener(t, h as EventListener);
      es.close();
      setConnected(false);
    };
  }, [qc]);
  return null;
}
