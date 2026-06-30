"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Static metadata not in DB (sparklines, steel, volume, etc.)
const MARKET_META: Record<string, {
  id: string; flag: string; change: number; steel: number;
  volume: number; hkc: boolean; yours: boolean; tide: string;
  yards: number; history: number[];
}> = {
  Aliağa:     { id:"aliaga",     flag:"🇹🇷", change:4,  steel:485, volume:12, hkc:true,  yours:true,  tide:"Jun 22", yards:22,  history:[298,305,310,318,322,315,320,328,332] },
  Alang:      { id:"alang",      flag:"🇮🇳", change:-3, steel:620, volume:31, hkc:true,  yours:false, tide:"Jun 24", yards:180, history:[465,470,480,488,495,492,498,504,501] },
  Chittagong: { id:"chittagong", flag:"🇧🇩", change:8,  steel:680, volume:18, hkc:false, yours:false, tide:"Jun 20", yards:65,  history:[498,505,512,518,525,530,533,538,541] },
  Gadani:     { id:"gadani",     flag:"🇵🇰", change:2,  steel:645, volume:8,  hkc:false, yours:false, tide:"Jun 23", yards:40,  history:[472,478,485,490,495,498,502,508,511] },
};

type DbYard = { country: string; source: string; updatedAt: string; prices: Record<string, number> };

// Fallback seed — GMS Week 3 2026, used until DB fetch completes
const STATIC_YARDS: Record<string, DbYard> = {
  Chittagong: { country:"Bangladesh", source:"GMS Week 3 2026", updatedAt: new Date().toISOString(), prices:{ bulker:400, tanker:420, container:430 } },
  Gadani:     { country:"Pakistan",   source:"GMS Week 3 2026", updatedAt: new Date().toISOString(), prices:{ bulker:390, tanker:410, container:420 } },
  Alang:      { country:"India",      source:"GMS Week 3 2026", updatedAt: new Date().toISOString(), prices:{ bulker:380, tanker:400, container:410 } },
  Aliağa:     { country:"Turkey",     source:"GMS Week 3 2026", updatedAt: new Date().toISOString(), prices:{ bulker:270, tanker:280, container:290 } },
};

function buildMarkets(yards: Record<string, DbYard>) {
  const src = Object.keys(yards).length ? yards : STATIC_YARDS;
  return Object.entries(src).map(([name, y]) => {
    const meta = MARKET_META[name] ?? { id: name.toLowerCase(), flag:"🌍", change:0, steel:600, volume:0, hkc:false, yours:false, tide:"—", yards:0, history:[] };
    const price = y.prices.tanker ?? y.prices.bulker ?? 0;
    return { name, country: y.country, source: y.source, updatedAt: y.updatedAt,
             prices: y.prices, price, ...meta };
  }).sort((a, b) => b.price - a.price);
}

const currencies = [
  { code:"USD", rate:1, symbol:"$" },
  { code:"EUR", rate:0.92, symbol:"€" },
  { code:"TRY", rate:32.5, symbol:"₺" },
  { code:"INR", rate:83.2, symbol:"₹" },
];

const months = ["Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];

function Spark({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data), max = Math.max(...data);
  const w = 100, h = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return x + "," + y;
  }).join(" ");
  const last = pts.split(" ").pop()?.split(",") || ["0","0"];
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

export default function Markets() {
  const router = useRouter();
  const [cur, setCur] = useState("USD");
  const [sel, setSel] = useState<string|null>(null);
  const [ldt, setLdt] = useState(8000);
  const [mkt, setMkt] = useState("chittagong");
  const [markets, setMarkets] = useState(() => buildMarkets({}));
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scrap-prices")
      .then(r => r.json())
      .then(d => {
        if (d.yards) {
          const built = buildMarkets(d.yards);
          setMarkets(built);
          const sample = Object.values(d.yards as Record<string, DbYard>)[0];
          if (sample) {
            setLastUpdated(sample.updatedAt);
            setDataSource(sample.source);
          }
        }
      })
      .catch(() => {});
  }, []);

  const C = currencies.find(c => c.code === cur) || currencies[0];
  const cv = (p: number) => Math.round(p * C.rate);
  const calcM = markets.find(m => m.id === mkt) || markets[0];
  const calcVal = calcM ? Math.round(ldt * calcM.price * C.rate).toLocaleString() : "—";
  const selM = markets.find(m => m.id === sel);

  return (
    <div style={{ fontFamily:"Inter, sans-serif", background:"#F9FAFB", color:"#101828", display:"flex", flexDirection:"column", height:"calc(100vh - 94px)" }}>

      {/* HEADER */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EAECF0", padding:"20px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:20, height:1.5, background:"#1D9E75" }} />
            <span style={{ fontSize:11, fontWeight:600, color:"#1D9E75", letterSpacing:"0.12em", textTransform:"uppercase" as const }}>Scrap Markets</span>
          </div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5, margin:0, color:"#101828" }}>Scrap Price Markets</h1>
          <div style={{ fontSize:12, color:"#667085", marginTop:4 }}>
            Live $/LDT prices · {dataSource ?? "Updated weekly"}{lastUpdated ? ` · ${new Date(lastUpdated).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}` : ""}
            <span style={{ color:"#1D9E75", marginLeft:8 }}>● Live</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:11, color:"#667085", marginRight:4 }}>Currency:</span>
          {currencies.map(c => (
            <button key={c.code} onClick={() => setCur(c.code)} style={{
              background: cur===c.code ? "#ECFDF3" : "#fff",
              border: cur===c.code ? "1px solid #A9EFC5" : "1px solid #EAECF0",
              borderRadius:6, padding:"4px 10px", color: cur===c.code ? "#1D9E75" : "#667085",
              fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"monospace",
            }}>{c.code}</button>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* MAIN */}
        <main style={{ flex:1, overflowY:"auto", padding:24 }}>

          {/* Market cards 2x2 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
            {markets.map(m => (
              <div key={m.id} onClick={() => setSel(m.id===sel ? null : m.id)} style={{
                background:"#fff",
                border: m.yours ? "1px solid #A9EFC5" : sel===m.id ? "1px solid #1D9E75" : "1px solid #EAECF0",
                borderRadius:14, padding:20, cursor:"pointer", transition:"all 0.15s",
                position:"relative", overflow:"hidden",
                boxShadow: sel===m.id ? "0 2px 8px rgba(29,158,117,0.08)" : "0 1px 2px rgba(16,24,40,0.04)",
              }}>
                {m.yours && <div style={{ position:"absolute", top:10, right:10, fontSize:9, fontWeight:600, padding:"2px 8px", borderRadius:8, background:"#ECFDF3", color:"#1D9E75", border:"1px solid #A9EFC5", fontFamily:"monospace" }}>YOUR MARKET</div>}

                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:28 }}>{m.flag}</span>
                    <div>
                      <div style={{ fontSize:16, fontWeight:700, color:"#101828" }}>{m.name}</div>
                      <div style={{ fontSize:12, color:"#667085" }}>{m.country}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:28, fontWeight:800, color:"#101828", letterSpacing:-1, lineHeight:1 }}>{C.symbol}{cv(m.price).toLocaleString()}</div>
                    <div style={{ fontSize:11, color:"#98A2B3" }}>per LDT</div>
                  </div>
                </div>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, fontWeight:600, padding:"2px 8px", borderRadius:6,
                      background: m.change>0 ? "#ECFDF3" : "#FEF3F2",
                      color: m.change>0 ? "#1D9E75" : "#F04438",
                      border: m.change>0 ? "1px solid #A9EFC5" : "1px solid #FECDCA",
                    }}>
                      {m.change>0?"+":""}{m.change} this week
                    </span>
                    <span style={{ fontSize:11, color:"#667085" }}>{m.prices.bulker && m.prices.tanker ? `${C.symbol}${cv(m.prices.bulker)}–${cv(m.prices.tanker)}` : ""}</span>
                  </div>
                  <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:6, fontFamily:"monospace",
                    background: m.hkc ? "#ECFDF3" : "#F9FAFB",
                    color: m.hkc ? "#1D9E75" : "#667085",
                    border: m.hkc ? "1px solid #A9EFC5" : "1px solid #EAECF0",
                  }}>{m.hkc?"✓ HKC":"HKC pending"}</span>
                </div>

                {/* Vessel-type prices */}
                {m.prices && Object.keys(m.prices).length > 0 && (
                  <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                    {(["bulker","tanker","container"] as const).map(t => m.prices[t] != null && (
                      <div key={t} style={{ flex:1, background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:8, padding:"6px 8px", textAlign:"center" as const }}>
                        <div style={{ fontSize:8, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:2 }}>{t}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#101828" }}>{C.symbol}{cv(m.prices[t])}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:9, color:"#98A2B3", fontFamily:"monospace", letterSpacing:"0.08em", marginBottom:4 }}>9-MONTH TREND</div>
                    <Spark data={m.history} color={m.change>0 ? "#1D9E75" : "#F04438"} />
                    <div style={{ display:"flex", justifyContent:"space-between", width:100, marginTop:2 }}>
                      <span style={{ fontSize:8, color:"#98A2B3", fontFamily:"monospace" }}>Oct</span>
                      <span style={{ fontSize:8, color:"#98A2B3", fontFamily:"monospace" }}>Jun</span>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:11, color:"#667085", marginBottom:3 }}>Steel: <span style={{ color:"#101828", fontWeight:600 }}>{C.symbol}{cv(m.steel)}/t</span></div>
                    <div style={{ fontSize:11, color:"#667085", marginBottom:3 }}>{m.volume} vessels/mo</div>
                    <div style={{ fontSize:11, color:"#667085" }}>Tide: <span style={{ color:"#1D9E75", fontWeight:500 }}>{m.tide}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* LDT Calculator */}
          <div style={{ background:"#fff", border:"1px solid #EAECF0", borderRadius:14, padding:20, marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:14 }}>LDT Value Calculator</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, alignItems:"end" }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#344054", marginBottom:6 }}>Estimated LDT</div>
                <input type="number" value={ldt} onChange={e => setLdt(Number(e.target.value))}
                  style={{ width:"100%", background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:8, padding:"10px 12px", color:"#101828", fontSize:15, fontWeight:600, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#344054", marginBottom:6 }}>Market</div>
                <select value={mkt} onChange={e => setMkt(e.target.value)}
                  style={{ width:"100%", background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:8, padding:"10px 12px", color:"#101828", fontSize:14, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box" as const }}>
                  {markets.map(m => <option key={m.id} value={m.id}>{m.flag} {m.name} — {C.symbol}{cv(m.price)}/LDT</option>)}
                </select>
              </div>
              <div style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:8, padding:"10px 14px" }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:4 }}>Estimated value</div>
                <div style={{ fontSize:22, fontWeight:800, color:"#1D9E75", letterSpacing:-0.5 }}>{C.symbol}{calcVal}</div>
                <div style={{ fontSize:10, color:"#667085", marginTop:2 }}>{ldt.toLocaleString()} LDT × {C.symbol}{cv(calcM.price)}/LDT</div>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div style={{ background:"#fff", border:"1px solid #EAECF0", borderRadius:14, overflow:"hidden" }}>
            <div style={{ padding:"12px 20px", borderBottom:"1px solid #EAECF0" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.1em" }}>Market Comparison</div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #EAECF0" }}>
                  {["Market","Price/LDT","Change","Steel","Volume","HKC","Next tide"].map(h => (
                    <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {markets.map((m, i) => (
                  <tr key={m.id} onClick={() => setSel(m.id===sel ? null : m.id)} style={{
                    borderBottom: i<markets.length-1 ? "1px solid #EAECF0" : "none",
                    background: m.yours ? "#ECFDF3" : sel===m.id ? "#F9FAFB" : "#fff",
                    cursor:"pointer",
                  }}>
                    <td style={{ padding:"11px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>{m.flag}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#101828" }}>{m.name}</div>
                          <div style={{ fontSize:11, color:"#667085" }}>{m.country}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:"11px 16px" }}>
                      <div style={{ fontSize:15, fontWeight:700, color:"#101828" }}>{C.symbol}{cv(m.price)}</div>
                      <div style={{ fontSize:10, color:"#98A2B3" }}>{m.prices.bulker && m.prices.tanker ? `${C.symbol}${cv(m.prices.bulker)}–${cv(m.prices.tanker)}` : ""}</div>
                    </td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ fontSize:12, fontWeight:600, padding:"2px 8px", borderRadius:6,
                        background: m.change>0 ? "#ECFDF3" : "#FEF3F2",
                        color: m.change>0 ? "#1D9E75" : "#F04438",
                      }}>
                        {m.change>0?"+":""}{m.change}
                      </span>
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"#344054" }}>{C.symbol}{cv(m.steel)}/t</td>
                    <td style={{ padding:"11px 16px", fontSize:12, color:"#344054" }}>{m.volume}/mo</td>
                    <td style={{ padding:"11px 16px" }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:6, fontFamily:"monospace",
                        background: m.hkc ? "#ECFDF3" : "#F9FAFB",
                        color: m.hkc ? "#1D9E75" : "#667085",
                      }}>{m.hkc?"✓":"–"}</span>
                    </td>
                    <td style={{ padding:"11px 16px", fontSize:11, color:"#667085" }}>{m.tide}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        {/* DETAIL PANEL */}
        {selM && (
          <aside style={{ width:260, background:"#fff", borderLeft:"1px solid #EAECF0", padding:20, overflowY:"auto", flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em" }}>Market Detail</div>
              <button onClick={() => setSel(null)} style={{ background:"none", border:"none", color:"#98A2B3", cursor:"pointer", fontSize:20 }}>×</button>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <span style={{ fontSize:32 }}>{selM.flag}</span>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:"#101828" }}>{selM.name}</div>
                <div style={{ fontSize:12, color:"#667085" }}>{selM.country}</div>
              </div>
            </div>

            <div style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:10, padding:14, marginBottom:12, textAlign:"center" as const }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>Current price</div>
              <div style={{ fontSize:32, fontWeight:800, color:"#1D9E75", letterSpacing:-1 }}>{C.symbol}{cv(selM.price)}</div>
              <div style={{ fontSize:11, color:"#667085" }}>per LDT</div>
              <div style={{ marginTop:8, fontSize:12, fontWeight:600, color: selM.change>0 ? "#1D9E75" : "#F04438" }}>
                {selM.change>0?"▲":"▼"} {Math.abs(selM.change)} this week
              </div>
            </div>

            <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:10 }}>9-month history</div>
              <svg width="100%" height={50} viewBox="0 0 220 50">
                {(() => {
                  const d = selM.history;
                  const mn = Math.min(...d), mx = Math.max(...d);
                  const pts = d.map((v, i) => {
                    const x = (i/(d.length-1))*216+2;
                    const y = 48-((v-mn)/(mx-mn||1))*44;
                    return x+","+y;
                  }).join(" ");
                  const last = pts.split(" ").pop()?.split(",") || ["0","0"];
                  return (<>
                    <polyline points={pts} fill="none" stroke="#1D9E75" strokeWidth={2} strokeLinejoin="round"/>
                    <circle cx={last[0]} cy={last[1]} r={4} fill="#1D9E75"/>
                  </>);
                })()}
              </svg>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                {months.map(m => <span key={m} style={{ fontSize:7, color:"#98A2B3", fontFamily:"monospace" }}>{m}</span>)}
              </div>
            </div>

            {/* Vessel-type breakdown */}
            {selM.prices && Object.keys(selM.prices).length > 0 && (
              <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:12, marginBottom:12 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>By vessel type</div>
                {(["bulker","tanker","container"] as const).map(t => selM.prices[t] != null && (
                  <div key={t} style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:11, color:"#667085", textTransform:"capitalize" as const }}>{t}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:"#101828" }}>{C.symbol}{cv(selM.prices[t])}/LDT</span>
                  </div>
                ))}
                {selM.source && <div style={{ fontSize:9, color:"#98A2B3", marginTop:6 }}>{selM.source}</div>}
              </div>
            )}
            {[["Active yards", selM.yards+" yards"], ["Steel price", C.symbol+cv(selM.steel)+"/ton"], ["Volume", selM.volume+" vessels/mo"], ["HKC", selM.hkc?"✓ Certified":"Pending"], ["Beaching", selM.tide]].map(([l, v]) => (
              <div key={String(l)} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:11, color:"#667085" }}>{l}</span>
                <span style={{ fontSize:11, fontWeight:500, color: String(l)==="HKC" && selM.hkc ? "#1D9E75" : "#101828" }}>{String(v)}</span>
              </div>
            ))}

            <button onClick={() => router.push("/")} style={{ width:"100%", background:"#1D9E75", border:"none", borderRadius:10, padding:11, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", marginTop:12 }}>
              Find vessels for {selM.name} →
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
