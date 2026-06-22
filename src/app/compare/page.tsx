"use client";
import { useState } from "react";

interface CompareVessel {
  imo: string;
  name: string;
  type: string;
  built_year: number | null;
  age: number | null;
  dwt: number | null;
  ldt: number | null;
  ldt_estimated: boolean | null;
  scrap_value_usd: number | null;
  scrap_value_estimated: boolean | null;
  score: number;
  scrap_category: string;
  flag: string | null;
  manager_name: string | null;
}

function fmtVal(usd: number | null | undefined, est: boolean | null | undefined) {
  if (!usd || usd < 100_000) return "—";
  const m = usd / 1_000_000;
  return `${est ? "~" : ""}$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
}

const CAT_COLOR: Record<string, string> = {
  critical: "#DC2626", high: "#D97706", medium: "#3B82F6", low: "#16A34A",
};

export default function ComparePage() {
  const [vessels, setVessels] = useState<CompareVessel[]>([]);
  const [query, setQuery]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function addVessel() {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/vessels?list=1");
      const d   = await res.json();
      const all: any[] = d.vessels || [];
      const found = all.find(v =>
        v.imo === q || v.mmsi === q ||
        (v.name || "").toLowerCase().includes(q.toLowerCase())
      );
      if (!found)                              { setError("Vessel not found");   setLoading(false); return; }
      if (vessels.find(v => v.imo === found.imo)) { setError("Already added"); setLoading(false); return; }
      if (vessels.length >= 4)                 { setError("Maximum 4 vessels"); setLoading(false); return; }
      setVessels(prev => [...prev, {
        imo: found.imo, name: found.name, type: found.type,
        built_year: found.built_year, age: found.age,
        dwt: found.dwt, ldt: found.ldt, ldt_estimated: found.ldt_estimated,
        scrap_value_usd: found.scrap_value_usd, scrap_value_estimated: found.scrap_value_estimated,
        score: found.score, scrap_category: found.scrap_category,
        flag: found.flag, manager_name: found.manager_name,
      }]);
      setQuery("");
    } catch { setError("Search failed"); }
    setLoading(false);
  }

  const ROWS: { label: string; key: (v: CompareVessel) => string; highlight?: boolean }[] = [
    { label: "Type",        key: v => v.type || "—" },
    { label: "Flag",        key: v => v.flag || "—" },
    { label: "Built",       key: v => v.built_year ? `${v.built_year} (${v.age}y)` : "—" },
    { label: "DWT",         key: v => v.dwt ? `${v.dwt.toLocaleString()} t` : "—" },
    { label: "LDT",         key: v => v.ldt ? `${v.ldt.toLocaleString()} t${v.ldt_estimated ? " ~" : ""}` : "—" },
    { label: "Scrap Score", key: v => `${v.score}/100` },
    { label: "Category",    key: v => v.scrap_category.toUpperCase() },
    { label: "Est. Value",  key: v => fmtVal(v.scrap_value_usd, v.scrap_value_estimated), highlight: true },
    { label: "Manager",     key: v => v.manager_name || "—" },
  ];

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100vh", padding: "40px 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#0B1E3D", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Vessel Compare
          </h1>
          <p style={{ fontSize: 14, color: "#8896A5", margin: 0 }}>
            Compare up to 4 vessels side by side
          </p>
        </div>

        {/* Add vessel */}
        <div style={{ display: "flex", gap: 10, marginBottom: error ? 12 : 32 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addVessel()}
            placeholder="Enter vessel name, IMO or MMSI..."
            style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 14, outline: "none", background: "#fff", color: "#1A1A2E", fontFamily: "Inter, sans-serif" }}
          />
          <button
            onClick={addVessel}
            disabled={loading}
            style={{ padding: "12px 24px", background: "#0B1E3D", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Searching..." : "Add Vessel"}
          </button>
          {vessels.length > 0 && (
            <button
              onClick={() => setVessels([])}
              style={{ padding: "12px 20px", background: "transparent", color: "#8896A5", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
            >
              Clear All
            </button>
          )}
        </div>

        {error && (
          <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 24, padding: "8px 12px", background: "#FEF2F2", borderRadius: 6, border: "1px solid #FECACA" }}>
            {error}
          </div>
        )}

        {vessels.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#0B1E3D", marginBottom: 8 }}>No vessels added yet</div>
            <div style={{ fontSize: 14, color: "#8896A5" }}>Search by vessel name, IMO or MMSI to start comparing</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ width: 160, textAlign: "left", padding: "16px 20px", fontSize: 11, fontWeight: 600, color: "#8896A5", textTransform: "uppercase" as const, letterSpacing: "0.04em", background: "#F8F9FA" }}>
                    Attribute
                  </th>
                  {vessels.map(v => (
                    <th key={v.imo} style={{ textAlign: "left", padding: "16px 20px", background: "#F8F9FA", borderLeft: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E3D" }}>{v.name || "—"}</div>
                      <div style={{ fontSize: 11, color: "#8896A5", marginTop: 2 }}>IMO {v.imo}</div>
                      <button
                        onClick={() => setVessels(prev => prev.filter(x => x.imo !== v.imo))}
                        style={{ marginTop: 6, fontSize: 10, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif" }}
                      >
                        Remove ×
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #F1F5F9", background: ri % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "12px 20px", fontSize: 11, fontWeight: 600, color: "#8896A5", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                      {row.label}
                    </td>
                    {vessels.map(v => {
                      const val        = row.key(v);
                      const isCategory = row.label === "Category";
                      const isValue    = row.label === "Est. Value" && val !== "—";
                      return (
                        <td key={v.imo} style={{ padding: "12px 20px", fontSize: 14, borderLeft: "1px solid #F1F5F9", color: isValue ? "#C9A84C" : isCategory ? (CAT_COLOR[v.scrap_category] ?? "#6B7280") : "#1A1A2E", fontWeight: isValue ? 700 : isCategory ? 600 : 400 }}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: "#C9A84C", fontStyle: "italic" }}>
          Export PDF — coming soon
        </p>
      </div>
    </div>
  );
}
