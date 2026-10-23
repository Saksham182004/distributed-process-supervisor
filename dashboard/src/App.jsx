import { useEffect, useState } from "react";
import { useClusterStatus, POLL_MS } from "./useClusterStatus.js";

const fmtTime = (d) =>
  d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ---------- icons ---------- */

const Icon = {
  up: (
    <svg viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
  ),
  down: (
    <svg viewBox="0 0 16 16"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" /></svg>
  ),
  failover: (
    <svg viewBox="0 0 16 16"><path d="M2.5 5h9l-2.5-2.5M13.5 11h-9L7 13.5" /></svg>
  ),
  leader: (
    <svg viewBox="0 0 16 16"><path d="M2.5 12.5h11L12.5 5 10 8 8 3.5 6 8 3.5 5z" /></svg>
  ),
  info: (
    <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 7.5v3.5M8 5v.01" /></svg>
  ),
  error: (
    <svg viewBox="0 0 16 16"><path d="M8 2.5 14 13H2zM8 6.5v3M8 11.2v.01" /></svg>
  ),
};

const EVENT_ICON = {
  online: Icon.up,
  offline: Icon.down,
  failover: Icon.failover,
  leader: Icon.leader,
  system: Icon.info,
  error: Icon.error,
};

/* ---------- pieces ---------- */

function Header({ leader, now }) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <span /><span /><span />
        </div>
        <div>
          <h1>Distributed Process Supervisor</h1>
          <p className="subtitle">Real-time cluster monitor</p>
        </div>
      </div>
      <div className="header-right">
        <div className={`leader-badge ${leader ? "" : "none"}`} title="Current coordinator holding the Redis leader lock">
          {Icon.leader}
          <span className="leader-label">Leader</span>
          <code>{leader ?? "none"}</code>
        </div>
        <div className="clock">
          <span className="clock-time">{fmtTime(now)}</span>
          <span className="clock-date">
            {now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatTile({ label, value, tone, sub }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function WorkerCard({ worker, secondsSincePoll }) {
  const alive = worker.status === "alive";
  // interpolate between polls so the counter ticks every second
  const seen = worker.lastSeenSeconds + secondsSincePoll;

  return (
    <article className={`worker ${alive ? "alive" : "dead"}`}>
      <div className="worker-top">
        <div className="worker-id">
          <svg viewBox="0 0 16 16" className="worker-icon" aria-hidden>
            <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
            <rect x="2" y="9" width="12" height="4.5" rx="1" />
            <path d="M4.5 4.75h.01M4.5 11.25h.01" />
          </svg>
          <code>{worker.id}</code>
        </div>
        <span className="status-pill">
          <span className={`dot ${alive ? "pulse" : ""}`} />
          {alive ? "Alive" : "Dead"}
        </span>
      </div>

      <p className="last-seen">
        Last seen <strong>{seen}s</strong> ago
      </p>

      <div className="services">
        <span className="services-label">Services · {worker.services.length}</span>
        <div className="tags">
          {worker.services.length ? (
            worker.services.map((s, i) => (
              <span key={`${s}-${i}`} className="tag">{s}</span>
            ))
          ) : (
            <span className="tag empty">none</span>
          )}
        </div>
      </div>

      {!alive && (
        <div className="failover-banner">
          {Icon.failover}
          FAILOVER TRIGGERED
        </div>
      )}
    </article>
  );
}

function EventLog({ events }) {
  return (
    <aside className="panel events">
      <div className="panel-head">
        <h2>Event log</h2>
        <span className="muted">last {events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="empty-state">Waiting for cluster activity…</p>
      ) : (
        <ol className="event-list">
          {events.map((e) => (
            <li key={e.id} className={`event ${e.type}`}>
              <span className="event-icon">{EVENT_ICON[e.type]}</span>
              <div className="event-body">
                <div className="event-row">
                  <span className="event-title">{e.title}</span>
                  <time>{fmtTime(e.at)}</time>
                </div>
                {e.detail && <p className="event-detail">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function StatusBar({ connectionError, lastUpdated, source }) {
  return (
    <footer className="statusbar">
      <span className={`dot ${connectionError ? "" : "pulse"} ${connectionError ? "red" : "green"}`} />
      <span>{connectionError ? "Disconnected" : "Connected"}</span>
      {source && !connectionError && <code className="muted">{source.replace(/^https?:\/\//, "")}</code>}
      <span className="sep">·</span>
      <span>Polling every {POLL_MS / 1000}s</span>
      <span className="sep">·</span>
      <span>Last updated: {fmtTime(lastUpdated)}</span>
    </footer>
  );
}

/* ---------- app ---------- */

export default function App() {
  const { status, events, connectionError, lastUpdated, source } = useClusterStatus();
  const now = useNow();

  const workers = status?.workers ?? [];
  const alive = workers.filter((w) => w.status === "alive");
  const dead = workers.length - alive.length;
  const servicesRunning = alive.reduce((n, w) => n + w.services.length, 0);
  const secondsSincePoll = lastUpdated
    ? Math.max(0, Math.floor((now - lastUpdated) / 1000))
    : 0;

  return (
    <div className="app">
      <Header leader={status?.leader} now={now} />

      {connectionError && (
        <div className="alert">
          {Icon.error}
          Can't reach the coordinator. Showing the last known state; retrying every {POLL_MS / 1000}s.
        </div>
      )}

      <section className="stats">
        <StatTile label="Total workers" value={workers.length} />
        <StatTile label="Alive workers" value={alive.length} tone="green" />
        <StatTile label="Dead workers" value={dead} tone={dead ? "red" : "red-muted"} />
        <StatTile label="Services running" value={servicesRunning} sub="on alive workers" />
      </section>

      <main className="main">
        <section className="panel">
          <div className="panel-head">
            <h2>Workers</h2>
            <span className="muted">
              {alive.length}/{workers.length} healthy
            </span>
          </div>
          {!status ? (
            <p className="empty-state">{connectionError ? "No data yet." : "Connecting to coordinator…"}</p>
          ) : workers.length === 0 ? (
            <p className="empty-state">No workers have sent a heartbeat yet.</p>
          ) : (
            <div className="worker-grid">
              {workers.map((w) => (
                <WorkerCard key={w.id} worker={w} secondsSincePoll={secondsSincePoll} />
              ))}
            </div>
          )}
        </section>

        <EventLog events={events} />
      </main>

      <StatusBar connectionError={connectionError} lastUpdated={lastUpdated} source={source} />
    </div>
  );
}
