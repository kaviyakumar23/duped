"use client";

import { useEffect, useRef, useState } from "react";
import type { WorldSnapshot, ConnState } from "./types";

/**
 * The live world feed. Prefers the SSE stream (`/api/world/stream`, a full WorldSnapshot per
 * `data:` line every ~1.5s); if it errors — or EventSource is unavailable — it transparently
 * degrades to polling `/api/world/snapshot` (~every 2s) WITHOUT discarding the last good snapshot,
 * so the world never blanks. Mirrors components/dashboard/useDashboardData.ts.
 */
export function useWorld() {
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const apply = (raw: string, live: boolean) => {
      try {
        const json = JSON.parse(raw) as WorldSnapshot & { error?: string };
        if (json.error || cancelled) return;
        if (!json.legendary || !json.invariants) return; // ignore malformed frames
        setSnapshot(json);
        setConn(live ? "live" : "polling");
      } catch {
        /* ignore a malformed frame; keep last good snapshot */
      }
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      const poll = async () => {
        try {
          const res = await fetch("/api/world/snapshot", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          if (!cancelled) apply(await res.text(), false);
        } catch {
          // Only surface "error" if we never managed to render anything.
          if (!cancelled) setConn((c) => (c === "live" ? "polling" : "error"));
        }
      };
      void poll();
      pollTimer.current = setInterval(poll, 2000);
    };

    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        es = new EventSource("/api/world/stream");
        es.onmessage = (ev) => {
          stopPolling();
          apply(ev.data, true);
        };
        es.onerror = () => {
          // SSE dropped — degrade to polling; keep the last snapshot on screen.
          startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      stopPolling();
    };
  }, []);

  return { snapshot, conn };
}
