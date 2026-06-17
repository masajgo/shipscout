"use client";
import { useState } from "react";
import VesselPanel from "@/components/VesselPanel";

const SHIP_TYPES = ["All", "Bulk Carrier", "Tanker", "Container", "General Cargo", "Cruise", "Offshore"];
const SIGNALS = ["All Signals", "Detained", "AIS Dark", "Lay-up", "P&I Withdrawn", "Survey Due"];

const VESSELS = [
  {
    imo: "9187432", name: "MV OCEAN ATLAS", flag: "Panama",
    type: "Bulk Carrier", built: 2001, dwt: 42500, ldt: 8200,
    location: "Rotterdam", score: 92, status: "Detained",
    statusType: "r", estValue: "$4.18M", market: "Alang", deadline: "Auction Jun 18",
  },
  {
    imo: "8811247", name: "MT SILVER CAPE", flag: "Togo",
    type: "Tanker", built: 1995, dwt: 58000, ldt: 11400,
    location: "Fujairah", score: 87, status: "P&I Withdrawn",
    statusType: "r", estValue: "$6.34M", market: "Chittagong", deadline: null,
  },
  {
    imo: "9234891", name: "MV ARCTIC STAR", flag: "Comoros",
    type: "General Cargo", built: 2000, dwt: 18200, ldt: 7600,
    location: "Singapore", score: 74, status: "94d Idle",
    statusType: "a", estValue: "$3.80M", market: "Gadani", deadline: null,
  },
  {
    imo: "9312456", name: "MV PEARL OF ASIA", flag: "Belize",
    type: "Bulk Carrier", built: 2002, dwt: 38000, ldt: 9100,
    location: "Chittagong", score: 68, status: "AIS Dark",
    statusType: "b", estValue: "$5.10M", market: "Alang", deadline: null,
  },
  {
    imo: "9423156", name: "MV NORDIC PRIDE", flag: "Mongolia",
    type: "General Cargo", built: 1998, dwt: 22000, ldt: 6800,
    location: "Karachi", score: 65, status: "Survey Due",
    statusType: "a", estValue: "$2.86M", market: "Gadani", deadline: null,
  },
  {
    imo: "9534217", name: "MT EASTERN GRACE", flag: "Cambodia",
    type: "Tanker", built: 1997, dwt: 45000, ldt: 9200,
    location: "Colombo", score: 61, status: "Lay-up",
    statusType: "a", estValue: "$5.15M", market: "Alang", deadline: null,
  },
];

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  r: { color: "#F04438", bg: "#FEF3F2", border: "#FECDCA" },
  a: { color: "#DC6803", bg: "#FFFAEB", border: "#FEF0C7" },
  b: { color: "#2563EB", bg: "#EFF8FF", border: "#B2DDFF" },
  g: { color: "#1D9E75", bg: "#ECFDF3", border: "#A9EFC5" },
};

const SHIP_TYPE_ICONS: Record<string, string> = {
  "Bulk Carrier":  "BC",
  "Tanker":        "TK",
  "Container":     "CT",
  "General Cargo": "GC",
  "Cruise":        "CR",
  "Offshore":      "OS",
};

export default function Home() {
  const [typeFilter, setTypeFilter] = useState("All");
  const [signalFilter, setSignalFilter] = useState("All Signals");
  const [selectedIMO, setSelectedIMO] = useState<string | null>(null);

  const filtered = VESSELS.filter(v => {
    if (typeFilter !== "All" && !v.type.includes(typeFilter)) return false;
    if (signalFilter !== "All Signals" && !v.status.includes(signalFilter)) return false;
    return true;
  });

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh" }}>

      {/* HERO */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "32px 28px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 40 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 20, height: 1.5, background: "#1D9E75" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#1D9E75", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
                Vessel Intelligence Platform
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: "#101828", letterSpacing: -1, lineHeight: 1.1, margin: "0 0 12px", fontFamily: "Inter, sans-serif" }}>
              Find scrap-eligible vessels<br />
              <span style={{ color: "#1D9E75" }}>before anyone else does.</span>
            </h1>
            <p style={{ fontSize: 13, color: "#667085", lineHeight: 1.7, maxWidth: 420, margin: 0 }}>
              Real-time detention signals, AIS dark events, and PSC inspection data unified into one actionable score. Trusted by recycling yards across Aliağa, Alang, Chittagong, and Gadani.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#EAECF0", border: "1px solid #EAECF0", borderRadius: 12, overflow: "hidden", flexShrink: 0, width: 240 }}>
            {[
              { n: "5,314", l: "Vessels tracked", c: "#101828" },
              { n: "14",    l: "New signals",      c: "#1D9E75" },
              { n: "3",     l: "Critical alerts",  c: "#F04438" },
              { n: "$24M",  l: "Pipeline value",   c: "#101828" },
            ].map(s => (
              <div key={s.l} style={{ background: "#fff", padding: "16px 18px" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.c, letterSpacing: -1, lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 10, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 4, fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "10px 28px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginRight: 4 }}>Type</span>
        {SHIP_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${typeFilter === t ? "#101828" : "#EAECF0"}`,
            background: typeFilter === t ? "#101828" : "#fff",
            color: typeFilter === t ? "#fff" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.15s",
          }}>{t}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "#EAECF0", margin: "0 4px" }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginRight: 4 }}>Signal</span>
        {SIGNALS.map(s => (
          <button key={s} onClick={() => setSignalFilter(s)} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${signalFilter === s ? "#1D9E75" : "#EAECF0"}`,
            background: signalFilter === s ? "#ECFDF3" : "#fff",
            color: signalFilter === s ? "#1D9E75" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.15s",
          }}>{s}</button>
        ))}
      </div>

      {/* VESSEL LIST */}
      <div style={{ padding: "20px 28px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{filtered.length} vessels found</div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>Sorted by scrap score — highest opportunity first</div>
          </div>
          <button style={{ fontSize: 12, color: "#667085", border: "1px solid #EAECF0", padding: "6px 14px", borderRadius: 7, background: "#fff", cursor: "pointer" }}>
            Sort: Score ▾
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(v => {
            const age = 2026 - v.built;
            const sc = STATUS_COLORS[v.statusType];
            const typeCode = SHIP_TYPE_ICONS[v.type] || "VS";
            return (
              <div key={v.imo}
                onClick={() => { console.log("[ShipScout] Opening panel for IMO:", v.imo); setSelectedIMO(v.imo); }}
                style={{
                  background: "#fff",
                  border: "1px solid #EAECF0",
                  borderLeft: v.statusType === "r" ? "3px solid #F04438" : v.statusType === "a" ? "3px solid #DC6803" : "1px solid #EAECF0",
                  borderRadius: v.statusType === "r" || v.statusType === "a" ? "0 10px 10px 0" : 10,
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: 16,
                  cursor: "pointer",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#1D9E75"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(29,158,117,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = v.statusType === "r" ? "#F04438" : v.statusType === "a" ? "#DC6803" : "#EAECF0"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.04)"; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F9FAFB", border: "1px solid #EAECF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#344054", letterSpacing: 0.5 }}>{typeCode}</div>
                </div>

                <div style={{ width: 48, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: v.statusType === "r" ? "#F04438" : v.statusType === "a" ? "#DC6803" : "#1D9E75" }}>{v.score}</div>
                  <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", color: "#98A2B3", textTransform: "uppercase" as const, marginTop: 2 }}>Score</div>
                </div>

                <div style={{ width: 1, height: 36, background: "#EAECF0", flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{v.name}</span>
                    <span style={{ fontSize: 11, color: "#C8CDD6", fontFamily: "monospace", marginLeft: 10 }}>IMO {v.imo}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                    {[
                      { label: "Type",     val: v.type },
                      { label: "Built",    val: `${v.built} · ${age}y` },
                      { label: "DWT",      val: `${v.dwt.toLocaleString()} t` },
                      { label: "LDT",      val: `${v.ldt.toLocaleString()} t` },
                      { label: "Location", val: v.location },
                      { label: "Flag",     val: v.flag },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{s.val}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 5, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}>
                    {v.status}
                  </span>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 100 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#101828", letterSpacing: -0.5 }}>{v.estValue}</div>
                  <div style={{ fontSize: 10, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 2 }}>Est. @ {v.market}</div>
                  {v.deadline && <div style={{ fontSize: 11, fontWeight: 700, color: "#F04438", marginTop: 4 }}>{v.deadline}</div>}
                </div>

                <div style={{ color: "#C8CDD6", fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedIMO && (
        <VesselPanel imo={selectedIMO} onClose={() => setSelectedIMO(null)} />
      )}
    </div>
  );
}
