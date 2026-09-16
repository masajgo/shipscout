"use client";
import { useCallback, useEffect, useState } from "react";

interface AgentRow {
  agent_name:        string;
  last_started_at:   string | null;
  last_finished_at:  string | null;
  last_status:       string | null;
  last_rows:         number | null;
  last_error:        string | null;
  run_count:         number;
  updated_at:        string;
}

const NAVY = "#07122E";
const GOLD = "#C9A84C";

const AGENT_META: Record<string, { label: string; schedule: string; where: "vercel" | "local" }> = {
  // Vercel cron jobs
  "run-scan":      { label: "News Scan (RSS + THETIS)", schedule: "Daily 05:30 UTC",  where: "vercel" },
  arrestscan:      { label: "Arrest Scan",              schedule: "Daily 06:00 UTC",  where: "vercel" },
  intelligence:    { label: "Intelligence Agent",       schedule: "Daily 11:00 UTC",  where: "vercel" },
  "scrap-scores":  { label: "Scrap Score Recompute",    schedule: "Monday 02:00 UTC", where: "vercel" },
  weeklydigest:    { label: "Weekly Digest",            schedule: "Monday 05:00 UTC", where: "vercel" },
  // Local launchd jobs (Mac)
  ownerscan:       { label: "Owner Scan (Equasis)",     schedule: "Daily 13:00",       where: "local" },
  healthmonitor:   { label: "Health Monitor",           schedule: "Every hour",        where: "local" },
  shiplistings:    { label: "Ship Listings Scraper",    schedule: "Daily 08:00",       where: "local" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusDot({ status }: { status: string | null }) {
  const color = status === "success" || status === "ok" ? "#16A34A"
              : status === "running"                    ? "#2563EB"
              : status === "error" || status === "degraded" ? "#DC2626"
              : "#9CA3AF";
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, marginRight: 6, flexShrink: 0,
      boxShadow: status === "running" ? `0 0 0 3px ${color}30` : "none",
    }} />
  );
}

function AuthGate({ onAuth }: { onAuth: (key: string) => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/agent-status?key=${encodeURIComponent(val)}`);
    if (res.ok) { sessionStorage.setItem("admin_key", val); onAuth(val); }
    else setErr(true);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F9FAFB" }}>
      <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 32, width: 320 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Admin access</div>
        <input
          value={val} onChange={e => setVal(e.target.value)}
          placeholder="Admin key" type="password"
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 14, boxSizing: "border-box" }}
        />
        {err && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 6 }}>Invalid key</div>}
        <button type="submit" style={{
          marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 6,
          background: NAVY, color: GOLD, fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer",
        }}>Enter</button>
      </form>
    </div>
  );
}

export default function AgentsPage() {
  const [key, setKey]       = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_key");
    if (saved) setKey(saved);
  }, []);

  const load = useCallback(async (k: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-status?key=${encodeURIComponent(k)}`);
      if (!res.ok) { setKey(null); sessionStorage.removeItem("admin_key"); return; }
      const d = await res.json();
      setAgents(d.agents ?? []);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) load(key);
  }, [key, load]);

  // auto-refresh every 60s
  useEffect(() => {
    if (!key) return;
    const t = setInterval(() => load(key), 60000);
    return () => clearInterval(t);
  }, [key, load]);

  if (!key) return <AuthGate onAuth={k => { setKey(k); }} />;

  const knownAgents = Object.keys(AGENT_META);
  const dbAgents = new Map(agents.map(a => [a.agent_name, a]));

  // Merge known agents with DB rows (some might not have run yet)
  const rows = knownAgents.map(name => dbAgents.get(name) ?? {
    agent_name: name, last_started_at: null, last_finished_at: null,
    last_status: null, last_rows: null, last_error: null, run_count: 0, updated_at: "",
  } as AgentRow);
  // Add any unknown agents from DB
  agents.forEach(a => { if (!knownAgents.includes(a.agent_name)) rows.push(a); });

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Agent Status</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
            Vercel crons + local Mac background jobs
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              Updated {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
          <button onClick={() => load(key)} disabled={loading} style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            border: "1px solid #E5E7EB", background: "#fff", color: "#374151",
          }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {(["vercel", "local"] as const).map(group => {
        const groupRows = rows.filter(a => (AGENT_META[a.agent_name]?.where ?? "local") === group);
        if (groupRows.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#6B7280",
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
            }}>
              {group === "vercel" ? "☁️ Vercel Crons" : "💻 Mac (Local)"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupRows.map(agent => {
                const meta   = AGENT_META[agent.agent_name];
                const isOpen = expanded === agent.agent_name;
                const status = agent.last_status;
                const never  = !agent.last_started_at;

                const cardBorder = status === "error" || status === "degraded"
                  ? "1px solid #FECACA" : "1px solid #E5E7EB";
                const cardBg = status === "error" || status === "degraded"
                  ? "#FFF5F5" : "#fff";

                return (
                  <div key={agent.agent_name} style={{ border: cardBorder, borderRadius: 10, background: cardBg, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : agent.agent_name)}
                      style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                    >
                      <StatusDot status={status} />
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>
                          {meta?.label ?? agent.agent_name}
                        </div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                          {meta?.schedule ?? "—"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>Last run</div>
                          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                            {never ? "Never" : timeAgo(agent.last_started_at!)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>Runs</div>
                          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                            {agent.run_count}
                          </div>
                        </div>
                        {agent.last_rows !== null && (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Rows</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                              {agent.last_rows}
                            </div>
                          </div>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                          background: status === "success" || status === "ok"       ? "#DCFCE7"
                                    : status === "running"                          ? "#DBEAFE"
                                    : status === "error" || status === "degraded"   ? "#FEE2E2"
                                    : "#F3F4F6",
                          color:     status === "success" || status === "ok"       ? "#15803D"
                                    : status === "running"                          ? "#1D4ED8"
                                    : status === "error" || status === "degraded"   ? "#B91C1C"
                                    : "#6B7280",
                        }}>
                          {status ?? "no data"}
                        </span>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: "1px solid #E5E7EB", padding: "12px 16px", background: "#F9FAFB" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: agent.last_error ? 12 : 0 }}>
                          {[
                            { label: "Started",    value: agent.last_started_at  ? new Date(agent.last_started_at).toLocaleString()  : "—" },
                            { label: "Finished",   value: agent.last_finished_at ? new Date(agent.last_finished_at).toLocaleString() : "—" },
                            { label: "Status",     value: agent.last_status ?? "—" },
                            { label: "Total runs", value: String(agent.run_count) },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
                              <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        {agent.last_error && (
                          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                              Last error
                            </div>
                            <pre style={{ margin: 0, fontSize: 11, color: "#7F1D1D", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                              {agent.last_error}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 32, padding: "14px 16px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Log files
        </div>
        <div style={{ fontSize: 12, color: "#374151", fontFamily: "monospace", lineHeight: 1.8 }}>
          ~/Library/Logs/shipscout/intelligence_agent_err.log<br/>
          ~/Library/Logs/shipscout/daily_scan.err.log<br/>
          ~/Library/Logs/shipscout/shiplistings.log<br/>
          /tmp/shipscout-healthmonitor.log
        </div>
      </div>
    </div>
  );
}
