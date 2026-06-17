"use client";
import { useState } from "react";

const SHIP_TYPES = [
  { group: "Dry Cargo",          types: ["Bulk Carrier", "General Cargo", "Container Ship"] },
  { group: "Tankers",            types: ["Oil / Crude Tanker", "Product Tanker", "Chemical Tanker", "LNG / LPG Carrier"] },
  { group: "Passenger",          types: ["Cruise Ship", "Ferry / RoPax", "Expedition Vessel"] },
  { group: "Offshore & Special", types: ["Offshore Supply (PSV)", "AHTS", "Dredger", "Tugboat", "Fishing Vessel"] },
  { group: "Other",              types: ["Reefer", "Car Carrier (RORO)", "Multi-Purpose"] },
];

const SALE_TYPES = [
  { id: "all",        label: "All Listings"     },
  { id: "distressed", label: "Distressed"        },
  { id: "judicial",   label: "Judicial Auction"  },
  { id: "bank",       label: "Bank Repo"         },
  { id: "voluntary",  label: "Voluntary Sale"    },
];

const AGE_FILTERS  = ["Any age", "0–10y", "10–20y", "20–25y", "25y+"];
const DWT_FILTERS  = ["Any DWT", "< 5,000", "5–15k", "15–40k", "40–80k", "80k+"];

const LISTINGS = [
  {
    id: 1, imo: "9038880", name: "NEREO", flag: "Panama",
    type: "Oil / Crude Tanker", group: "Tankers",
    built: 1993, dwt: 99355, ldt: 16890, location: "Fujairah",
    price: "$10.5M", priceType: "Asking",
    saleType: "distressed",
    tags: [{ label: "33y old", type: "idle" }, { label: "Motivated seller", type: "motivated" }],
    urgent: true,
  },
  {
    id: 2, imo: "8912522", name: "RUN FU 7", flag: "Panama",
    type: "Bulk Carrier", group: "Dry Cargo",
    built: 1990, dwt: 38852, ldt: 6605, location: "Singapore anchorage",
    price: "On Request", priceType: "Negotiable",
    saleType: "bank",
    tags: [{ label: "Bank Repo", type: "bank" }, { label: "36y old", type: "urgent" }],
    urgent: true,
  },
  {
    id: 3, imo: "9108128", name: "LISBON EXPRESS", flag: "Bermuda",
    type: "Container Ship", group: "Dry Cargo",
    built: 1995, dwt: 34330, ldt: 5836, location: "Bremerhaven",
    price: "$3.8M", priceType: "Asking",
    saleType: "voluntary",
    tags: [{ label: "Survey Due", type: "idle" }, { label: "Price reduced", type: "reduced" }],
    urgent: false,
  },
  {
    id: 4, imo: "9015101", name: "HAO 3", flag: "Saint Kitts",
    type: "Bulk Carrier", group: "Dry Cargo",
    built: 1991, dwt: 22174, ldt: 3770, location: "Chittagong",
    price: "$2.3M", priceType: "Asking",
    saleType: "distressed",
    tags: [{ label: "94d idle", type: "idle" }, { label: "Motivated seller", type: "motivated" }],
    urgent: false,
  },
  {
    id: 5, imo: "9083940", name: "FORTUNE BOOMY", flag: "Sierra Leone",
    type: "Chemical Tanker", group: "Tankers",
    built: 1994, dwt: 11559, ldt: 1965, location: "Rotterdam",
    price: "$1.4M", priceType: "Asking",
    saleType: "voluntary",
    tags: [{ label: "New listing", type: "new" }],
    urgent: false,
  },
  {
    id: 6, imo: "9040089", name: "CARIBBEAN ENERGY", flag: "Mongolia",
    type: "Chemical Tanker", group: "Tankers",
    built: 1993, dwt: 10511, ldt: 1787, location: "Aliağa anchorage",
    price: "$1.1M", priceType: "Reserve",
    saleType: "judicial",
    tags: [{ label: "Auction Jul 3", type: "urgent" }, { label: "Judicial", type: "judicial" }],
    urgent: true,
  },
  {
    id: 7, imo: "9078098", name: "VANNA", flag: "Malta",
    type: "Chemical Tanker", group: "Tankers",
    built: 1994, dwt: 8256, ldt: 1404, location: "Gadani",
    price: "$0.9M", priceType: "Asking",
    saleType: "distressed",
    tags: [{ label: "Lay-up", type: "idle" }],
    urgent: false,
  },
  {
    id: 8, imo: "9004231", name: "MSC ESHA F", flag: "Panama",
    type: "Container Ship", group: "Dry Cargo",
    built: 1993, dwt: 12854, ldt: 2185, location: "Karachi",
    price: "$1.6M", priceType: "Asking",
    saleType: "voluntary",
    tags: [{ label: "AIS Dark", type: "bank" }],
    urgent: false,
  },
];

const TAG_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  urgent:    { color: "#F04438", bg: "#FEF3F2", border: "#FECDCA" },
  judicial:  { color: "#F04438", bg: "#FEF3F2", border: "#FECDCA" },
  bank:      { color: "#2563EB", bg: "#EFF8FF", border: "#B2DDFF" },
  distressed:{ color: "#DC6803", bg: "#FFFAEB", border: "#FEF0C7" },
  idle:      { color: "#DC6803", bg: "#FFFAEB", border: "#FEF0C7" },
  motivated: { color: "#667085", bg: "#F9FAFB", border: "#EAECF0" },
  reduced:   { color: "#1D9E75", bg: "#ECFDF3", border: "#A9EFC5" },
  new:       { color: "#1D9E75", bg: "#ECFDF3", border: "#A9EFC5" },
};

const TYPE_CODE: Record<string, string> = {
  "Bulk Carrier": "BC", "General Cargo": "GC", "Container Ship": "CT",
  "Oil / Crude Tanker": "TK", "Product Tanker": "PT", "Chemical Tanker": "CH",
  "LNG / LPG Carrier": "LG", "Cruise Ship": "CR", "Ferry / RoPax": "FR",
  "Expedition Vessel": "EX", "Offshore Supply (PSV)": "OS", "AHTS": "AH",
  "Dredger": "DR", "Tugboat": "TG", "Fishing Vessel": "FV",
  "Reefer": "RF", "Car Carrier (RORO)": "RO", "Multi-Purpose": "MP",
};

export default function SNPPage() {
  const [saleType, setSaleType]           = useState("all");
  const [selectedType, setSelectedType]   = useState("All");
  const [ageFilter, setAgeFilter]         = useState("Any age");
  const [dwtFilter, setDwtFilter]         = useState("Any DWT");
  const [showTypeMenu, setShowTypeMenu]   = useState(false);

  const filtered = LISTINGS.filter(l => {
    if (saleType !== "all" && l.saleType !== saleType) return false;
    if (selectedType !== "All" && l.type !== selectedType) return false;
    if (ageFilter !== "Any age") {
      const age = 2026 - l.built;
      if (ageFilter === "0–10y"  && age > 10)              return false;
      if (ageFilter === "10–20y" && (age < 10 || age > 20)) return false;
      if (ageFilter === "20–25y" && (age < 20 || age > 25)) return false;
      if (ageFilter === "25y+"   && age < 25)              return false;
    }
    return true;
  });

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh" }}>

      {/* HERO */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "32px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 20, height: 1.5, background: "#1D9E75" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#1D9E75", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
            Sale & Purchase
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#101828", letterSpacing: -0.8, lineHeight: 1.15, margin: "0 0 8px", fontFamily: "Inter, sans-serif" }}>
          Find your next vessel.<br />
          <span style={{ color: "#1D9E75" }}>Before the market does.</span>
        </h1>
        <p style={{ fontSize: 13, color: "#667085", lineHeight: 1.7, maxWidth: 480, margin: "0 0 20px" }}>
          Distressed sales, judicial auctions, bank repos and voluntary sales — unified with AI-powered valuation and owner contact data.
        </p>

        {/* SALE TYPE TABS */}
        <div style={{ display: "flex", gap: 0 }}>
          {SALE_TYPES.map(t => (
            <button key={t.id} onClick={() => setSaleType(t.id)} style={{
              background: "none", border: "none",
              borderBottom: saleType === t.id ? "2px solid #1D9E75" : "2px solid transparent",
              padding: "10px 18px",
              color: saleType === t.id ? "#101828" : "#667085",
              fontSize: 13, fontWeight: saleType === t.id ? 600 : 400,
              cursor: "pointer", transition: "all 0.15s",
              fontFamily: "Inter, sans-serif",
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "#EAECF0", borderBottom: "1px solid #EAECF0" }}>
        {[
          { val: "847",  unit: "vessels", label: "Active listings",      sub: "+23 this week",          subColor: "#1D9E75" },
          { val: "34",   unit: "",        label: "Distressed / urgent",   sub: "3 auctions this week",   subColor: "#F04438" },
          { val: "$2.4", unit: "B",       label: "Total listed value",    sub: "Avg. $2.8M / vessel",    subColor: "#98A2B3" },
          { val: "18",   unit: "days",    label: "Avg. time to close",    sub: "4d faster than market",  subColor: "#1D9E75" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", padding: "16px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#101828", letterSpacing: -0.8, lineHeight: 1 }}>
              {s.val}<span style={{ fontSize: 13, fontWeight: 400, color: "#98A2B3", marginLeft: 2 }}>{s.unit}</span>
            </div>
            <div style={{ fontSize: 10, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.06em", margin: "4px 0 3px", fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: s.subColor, fontWeight: 500 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "10px 28px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, position: "relative" }}>

        {/* Ship type dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 7,
              border: `1px solid ${selectedType !== "All" ? "#101828" : "#EAECF0"}`,
              background: selectedType !== "All" ? "#101828" : "#fff",
              color: selectedType !== "All" ? "#fff" : "#667085",
              cursor: "pointer", fontFamily: "Inter, sans-serif",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {selectedType !== "All" ? selectedType : "Ship Type"} ▾
          </button>
          {showTypeMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              background: "#fff", border: "1px solid #EAECF0",
              borderRadius: 10, padding: 8, zIndex: 50, minWidth: 240,
              boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
            }}>
              <div
                onClick={() => { setSelectedType("All"); setShowTypeMenu(false); }}
                style={{ padding: "6px 10px", fontSize: 12, color: "#667085", cursor: "pointer", borderRadius: 6, background: selectedType === "All" ? "#F9FAFB" : "none" }}
              >
                All types
              </div>
              {SHIP_TYPES.map(g => (
                <div key={g.group}>
                  <div style={{ padding: "8px 10px 4px", fontSize: 10, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                    {g.group}
                  </div>
                  {g.types.map(t => (
                    <div key={t}
                      onClick={() => { setSelectedType(t); setShowTypeMenu(false); }}
                      style={{ padding: "6px 10px 6px 18px", fontSize: 12, cursor: "pointer", borderRadius: 6, background: selectedType === t ? "#ECFDF3" : "none", color: selectedType === t ? "#1D9E75" : "#344054" }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 22, background: "#EAECF0" }} />

        {/* Age */}
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Age</span>
        {AGE_FILTERS.map(f => (
          <button key={f} onClick={() => setAgeFilter(f)} style={{
            fontSize: 12, padding: "5px 11px", borderRadius: 6,
            border: `1px solid ${ageFilter === f ? "#101828" : "#EAECF0"}`,
            background: ageFilter === f ? "#101828" : "#fff",
            color: ageFilter === f ? "#fff" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif",
          }}>{f}</button>
        ))}

        <div style={{ width: 1, height: 22, background: "#EAECF0" }} />

        {/* DWT */}
        <span style={{ fontSize: 10, fontWeight: 600, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>DWT</span>
        {DWT_FILTERS.map(f => (
          <button key={f} onClick={() => setDwtFilter(f)} style={{
            fontSize: 12, padding: "5px 11px", borderRadius: 6,
            border: `1px solid ${dwtFilter === f ? "#101828" : "#EAECF0"}`,
            background: dwtFilter === f ? "#101828" : "#fff",
            color: dwtFilter === f ? "#fff" : "#667085",
            cursor: "pointer", fontFamily: "Inter, sans-serif",
          }}>{f}</button>
        ))}
      </div>

      {/* LISTINGS */}
      <div style={{ padding: "20px 28px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{filtered.length} vessels found</div>
            <div style={{ fontSize: 12, color: "#98A2B3", marginTop: 2 }}>
              {saleType === "all" ? "All sale types" : SALE_TYPES.find(t => t.id === saleType)?.label}
              {selectedType !== "All" ? ` · ${selectedType}` : ""}
            </div>
          </div>
          <button style={{ fontSize: 12, color: "#667085", border: "1px solid #EAECF0", padding: "6px 14px", borderRadius: 7, background: "#fff", cursor: "pointer" }}>
            Sort: Urgency ▾
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(v => {
            const age = 2026 - v.built;
            const code = TYPE_CODE[v.type] || "VS";
            return (
              <div key={v.id} style={{
                background: "#fff",
                border: "1px solid #EAECF0",
                borderLeft: v.urgent ? "3px solid #F04438" : "1px solid #EAECF0",
                borderRadius: v.urgent ? "0 10px 10px 0" : 10,
                padding: "16px 20px",
                display: "flex", alignItems: "center", gap: 16,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(16,24,40,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(16,24,40,0.04)"; }}
              >
                {/* Type code */}
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F9FAFB", border: "1px solid #EAECF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#344054", letterSpacing: 0.5 }}>{code}</span>
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#101828" }}>{v.name}</span>
                    <span style={{ fontSize: 11, color: "#C8CDD6", fontFamily: "monospace" }}>IMO {v.imo}</span>
                    <span style={{ fontSize: 11, color: "#98A2B3" }}>{v.flag}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                    {[
                      { label: "Type",     val: v.type },
                      { label: "Built",    val: `${v.built} · ${age}y` },
                      v.dwt ? { label: "DWT", val: `${v.dwt.toLocaleString()} t` } : null,
                      { label: "LDT",      val: `${v.ldt.toLocaleString()} t` },
                      { label: "Location", val: v.location },
                    ].filter(Boolean).map(s => s && (
                      <div key={s.label}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{s.val}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                  {v.tags.map(tag => {
                    const ts = TAG_STYLES[tag.type] || TAG_STYLES.motivated;
                    return (
                      <span key={tag.label} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 5, color: ts.color, background: ts.bg, border: `1px solid ${ts.border}`, whiteSpace: "nowrap" as const }}>
                        {tag.label}
                      </span>
                    );
                  })}
                </div>

                {/* Price */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 100 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#101828", letterSpacing: -0.5 }}>{v.price}</div>
                  <div style={{ fontSize: 10, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 2 }}>{v.priceType}</div>
                </div>

                <div style={{ color: "#C8CDD6", fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#98A2B3", fontSize: 13 }}>
              No vessels match your current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
