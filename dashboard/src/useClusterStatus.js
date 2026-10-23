import { useEffect, useRef, useState } from "react";

export const POLL_MS = 3000;
const MAX_EVENTS = 20;
const REQUEST_TIMEOUT_MS = 2000;

// coordinator-1 first, coordinator-2 as a fallback so the dashboard survives
// killing a coordinator during a failover demo. Override with VITE_COORDINATOR_URLS.
const ENDPOINTS = (
  import.meta.env.VITE_COORDINATOR_URLS ||
  "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);

async function fetchStatus() {
  let lastError;
  for (const base of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/status`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: await res.json(), source: base };
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

// Compare two snapshots and describe what changed between them.
function diffSnapshots(prev, next) {
  const events = [];

  if (!prev) {
    const alive = next.workers.filter((w) => w.status === "alive").length;
    events.push({
      type: "system",
      title: "Monitoring started",
      detail: `${next.workers.length} worker(s) discovered, ${alive} alive`,
    });
    return events;
  }

  const before = new Map(prev.workers.map((w) => [w.id, w]));

  for (const w of next.workers) {
    const old = before.get(w.id);

    if (!old) {
      if (w.status === "alive") {
        events.push({ type: "online", title: `${w.id} came online`, detail: serviceList(w) });
      }
      continue;
    }

    if (old.status === "alive" && w.status === "dead") {
      events.push({
        type: "offline",
        title: `${w.id} went offline`,
        detail: `No heartbeat for ${w.lastSeenSeconds}s`,
      });
      // the coordinator only reassigns workers that were running something
      if (old.services.length > 0) {
        events.push({
          type: "failover",
          title: "Failover triggered",
          detail: `${old.services.join(", ")} reassigned from ${w.id}`,
        });
      }
    } else if (old.status === "dead" && w.status === "alive") {
      events.push({ type: "online", title: `${w.id} recovered`, detail: serviceList(w) });
    }
  }

  if (prev.leader !== next.leader) {
    events.push({
      type: "leader",
      title: next.leader ? "Leader changed" : "Leader lost",
      detail: next.leader
        ? `${prev.leader ?? "none"} → ${next.leader}`
        : `${prev.leader} released the lock`,
    });
  }

  return events;
}

function serviceList(w) {
  return w.services.length ? `Running ${w.services.join(", ")}` : "No services";
}

export function useClusterStatus() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [connectionError, setConnectionError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [source, setSource] = useState(null);

  const prevRef = useRef(null);
  const wasErrorRef = useRef(false);
  const nextIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const pushEvents = (list) => {
      if (!list.length) return;
      const at = new Date();
      const stamped = list.map((e) => ({ ...e, id: nextIdRef.current++, at }));
      setEvents((prev) => [...stamped.reverse(), ...prev].slice(0, MAX_EVENTS));
    };

    const poll = async () => {
      if (inFlight) return; // previous poll still waiting on timeouts
      inFlight = true;
      try {
        const { data, source } = await fetchStatus();
        if (cancelled) return;

        const found = [];
        if (wasErrorRef.current) {
          found.push({ type: "system", title: "Connection restored", detail: `Reconnected via ${source}` });
        }
        found.push(...diffSnapshots(prevRef.current, data));
        pushEvents(found);

        prevRef.current = data;
        wasErrorRef.current = false;
        setStatus(data);
        setSource(source);
        setLastUpdated(new Date());
        setConnectionError(false);
      } catch (e) {
        if (cancelled) return;
        if (!wasErrorRef.current) {
          pushEvents([{ type: "error", title: "Coordinator unreachable", detail: e.message || "Request failed" }]);
        }
        wasErrorRef.current = true;
        setConnectionError(true);
      } finally {
        inFlight = false;
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { status, events, connectionError, lastUpdated, source };
}
