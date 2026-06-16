"use client";
import { useState } from "react";

const markets = [
  { id:"aliaga", name:"Aliağa", country:"Turkey", flag:"🇹🇷", price:332, low:320, high:345, change:4, steel:485, volume:12, hkc:true, yours:true, tide:"Jun 18", yards:22, history:[298,305,310,318,322,315,320,328,332] },
  { id:"alang", name:"Alang", country:"India", flag:"🇮🇳", price:501, low:490, high:515, change:-3, steel:620, volume:31, hkc:true, yours:false, tide:"Jun 20", yards:180, history:[465,470,480,488,495,492,498,504,501] },
  { id:"chittagong", name:"Chittagong", country:"Bangladesh", flag:"🇧🇩", price:541, low:530, high:555, change:8, steel:680, volume:18, hkc:false, yours:false, tide:"Jun 16", yards:65, history:[498,505,512,518,525,530,533,538,541] },
  { id:"gadani", name:"Gadani", country:"Pakistan", flag:"🇵🇰", price:511, low:500, high:525, change:2, steel:645, volume:8, hkc:false, yours:false, tide:"Jun 19", yards:40, history:[472,478,485,490,495,498,502,508,511] },
];

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
  const [cur, setCur] = useState("USD");
  const [sel, setSel] = useState<string|null>(null);
  const [ldt, setLdt] = useState(8000);
  const [mkt, setMkt] = useState("alang");

  const C = currencies.find(c => c.code === cur) || currencies[0];
  const cv = (p: number) => Math.round(p * C.rate);
  const calcM = markets.find(m => m.id === mkt) || markets[1];
  const calcVal = Math.round(ldt * calcM.price * C.rate).toLocaleString();
  const selM = markets.find(m => m.id === sel);

  const nav: React.CSSProperties = { background:"#0D1F28", borderBottom:"1px solid rgba(143,168,178,0.15)", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:50 };

  return (
    <div style={{fontFamily:"Inter, sans-serif", minHeight:"100vh", background:"#0D1F28", color:"#E8F0F3"}}>

      {/* NAV */}
      <nav style={nav}>
        <div style={{display:"flex", alignItems:"center", gap:32}}>
          <div style={{fontFamily:"Space Grotesk, sans-serif", fontWeight:700, fontSize:18, letterSpacing:-0.5}}>
            <span style={{color:"#E8F0F3"}}>Ship</span><span style={{color:"#1D9E75"}}>Scout</span>
          </div>
          {[["Vessels","/"],["Markets","/markets"],["Map","/map"],["Deal CRM","/crm"],["Alerts","/alerts"]].map(([t,h])=>(
            <a key={t} href={h} style={{color: t==="Markets"?"#1D9E75":"#8FA8B2", fontSize:13, fontWeight:500, textDecoration:"none", borderBottom: t==="Markets"?"2px solid #1D9E75":"2px solid transparent", paddingBottom:2}}>{t}</a>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          <span style={{fontSize:11, color:"#8FA8B2", marginRight:4}}>Currency:</span>
          {currencies.map(c=>(
            <button key={c.code} onClick={()=>setCur(c.code)} style={{
              background: cur===c.code?"rgba(29,158,117,0.15)":"none",
              border: cur===c.code?"1px solid rgba(29,158,117,0.3)":"1px solid rgba(143,168,178,0.15)",
              borderRadius:6, padding:"3px 8px", color: cur===c.code?"#1D9E75":"#8FA8B2",
              fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"monospace"
            }}>{c.code}</button>
          ))}
        </div>
      </nav>

      <div style={{display:"flex", height:"calc(100vh - 56px)"}}>

        {/* MAIN */}
        <main style={{flex:1, overflowY:"auto", padding:24}}>

          {/* Title */}
          <div style={{marginBottom:24}}>
            <h1 style={{fontFamily:"Space Grotesk, sans-serif", fontSize:22, fontWeight:700, letterSpacing:-0.5, margin:0}}>Scrap Price Markets</h1>
            <div style={{fontSize:12, color:"#8FA8B2", marginTop:4}}>Live $/LDT prices · Updated weekly · Jun 14, 2026 <span style={{color:"#1D9E75", marginLeft:8}}>● Live</span></div>
          </div>

          {/* Market cards 2x2 */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24}}>
            {markets.map(m=>(
              <div key={m.id} onClick={()=>setSel(m.id===sel?null:m.id)} style={{
                background: sel===m.id?"#1A3A4A":"#0F2733",
                border: m.yours?"1px solid rgba(29,158,117,0.45)": sel===m.id?"1px solid rgba(29,158,117,0.3)":"1px solid rgba(143,168,178,0.12)",
                borderRadius:14, padding:20, cursor:"pointer", transition:"all 0.15s", position:"relative", overflow:"hidden"
              }}>
                {m.yours && <div style={{position:"absolute", top:10, right:10, fontSize:9, fontWeight:600, padding:"2px 8px", borderRadius:8, background:"rgba(29,158,117,0.18)", color:"#1D9E75", border:"1px solid rgba(29,158,117,0.3)", fontFamily:"monospace"}}>YOUR MARKET</div>}

                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14}}>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <span style={{fontSize:28}}>{m.flag}</span>
                    <div>
                      <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:16, fontWeight:700, color:"#E8F0F3"}}>{m.name}</div>
                      <div style={{fontSize:12, color:"#8FA8B2"}}>{m.country}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:28, fontWeight:700, color:"#E8F0F3", letterSpacing:-1, lineHeight:1}}>{C.symbol}{cv(m.price).toLocaleString()}</div>
                    <div style={{fontSize:11, color:"#8FA8B2"}}>per LDT</div>
                  </div>
                </div>

                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
                  <div style={{display:"flex", alignItems:"center", gap:8}}>
                    <span style={{fontSize:12, fontWeight:600, padding:"2px 8px", borderRadius:6,
                      background: m.change>0?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)",
                      color: m.change>0?"#4ADE80":"#F87171"}}>
                      {m.change>0?"+":""}{m.change} this week
                    </span>
                    <span style={{fontSize:11, color:"#8FA8B2"}}>{C.symbol}{cv(m.low)}–{cv(m.high)}</span>
                  </div>
                  <span style={{fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:6, fontFamily:"monospace",
                    background: m.hkc?"rgba(29,158,117,0.1)":"rgba(143,168,178,0.08)",
                    color: m.hkc?"#1D9E75":"#8FA8B2",
                    border: m.hkc?"1px solid rgba(29,158,117,0.2)":"1px solid rgba(143,168,178,0.15)"
                  }}>{m.hkc?"✓ HKC":"HKC pending"}</span>
                </div>

                <div style={{display:"flex", alignItems:"flex-end", justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", letterSpacing:"0.08em", marginBottom:4}}>9-MONTH TREND</div>
                    <Spark data={m.history} color={m.change>0?"#4ADE80":"#F87171"} />
                    <div style={{display:"flex", justifyContent:"space-between", width:100, marginTop:2}}>
                      <span style={{fontSize:8, color:"rgba(143,168,178,0.4)", fontFamily:"monospace"}}>Oct</span>
                      <span style={{fontSize:8, color:"rgba(143,168,178,0.4)", fontFamily:"monospace"}}>Jun</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11, color:"#8FA8B2", marginBottom:3}}>Steel: <span style={{color:"#E8F0F3", fontWeight:600}}>{C.symbol}{cv(m.steel)}/t</span></div>
                    <div style={{fontSize:11, color:"#8FA8B2", marginBottom:3}}>{m.volume} vessels/mo</div>
                    <div style={{fontSize:11, color:"#8FA8B2"}}>Tide: <span style={{color:"#1D9E75", fontWeight:500}}>{m.tide}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* LDT Calculator */}
          <div style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.12)", borderRadius:14, padding:20, marginBottom:20}}>
            <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14}}>LDT Value Calculator</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, alignItems:"end"}}>
              <div>
                <div style={{fontSize:11, color:"#8FA8B2", marginBottom:6}}>Estimated LDT</div>
                <input type="number" value={ldt} onChange={e=>setLdt(Number(e.target.value))}
                  style={{width:"100%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.18)", borderRadius:8, padding:"10px 12px", color:"#E8F0F3", fontSize:15, fontWeight:600, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}} />
              </div>
              <div>
                <div style={{fontSize:11, color:"#8FA8B2", marginBottom:6}}>Market</div>
                <select value={mkt} onChange={e=>setMkt(e.target.value)}
                  style={{width:"100%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.18)", borderRadius:8, padding:"10px 12px", color:"#E8F0F3", fontSize:14, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}}>
                  {markets.map(m=><option key={m.id} value={m.id}>{m.flag} {m.name} — {C.symbol}{cv(m.price)}/LDT</option>)}
                </select>
              </div>
              <div style={{background:"#1A3A4A", border:"1px solid rgba(29,158,117,0.3)", borderRadius:8, padding:"10px 14px"}}>
                <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4}}>Estimated value</div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:22, fontWeight:700, color:"#1D9E75"}}>{C.symbol}{calcVal}</div>
                <div style={{fontSize:10, color:"#8FA8B2", marginTop:2}}>{ldt.toLocaleString()} LDT × {C.symbol}{cv(calcM.price)}/LDT</div>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.12)", borderRadius:14, overflow:"hidden"}}>
            <div style={{padding:"12px 20px", borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.1em"}}>Market Comparison</div>
            </div>
            <table style={{width:"100%", borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
                  {["Market","Price/LDT","Change","Steel","Volume","HKC","Next tide"].map(h=>(
                    <th key={h} style={{padding:"9px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.06em"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {markets.map((m,i)=>(
                  <tr key={m.id} onClick={()=>setSel(m.id===sel?null:m.id)} style={{
                    borderBottom: i<markets.length-1?"1px solid rgba(143,168,178,0.08)":"none",
                    background: m.yours?"rgba(29,158,117,0.04)": sel===m.id?"rgba(29,158,117,0.06)":"none",
                    cursor:"pointer"
                  }}>
                    <td style={{padding:"11px 16px"}}>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <span style={{fontSize:18}}>{m.flag}</span>
                        <div>
                          <div style={{fontSize:13, fontWeight:600, color:"#E8F0F3"}}>{m.name}</div>
                          <div style={{fontSize:11, color:"#8FA8B2"}}>{m.country}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"11px 16px"}}>
                      <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700, color:"#E8F0F3"}}>{C.symbol}{cv(m.price)}</div>
                      <div style={{fontSize:10, color:"#8FA8B2"}}>{C.symbol}{cv(m.low)}–{cv(m.high)}</div>
                    </td>
                    <td style={{padding:"11px 16px"}}>
                      <span style={{fontSize:12, fontWeight:600, padding:"2px 8px", borderRadius:6,
                        background: m.change>0?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)",
                        color: m.change>0?"#4ADE80":"#F87171"}}>
                        {m.change>0?"+":""}{m.change}
                      </span>
                    </td>
                    <td style={{padding:"11px 16px", fontSize:12, color:"#E8F0F3"}}>{C.symbol}{cv(m.steel)}/t</td>
                    <td style={{padding:"11px 16px", fontSize:12, color:"#E8F0F3"}}>{m.volume}/mo</td>
                    <td style={{padding:"11px 16px"}}>
                      <span style={{fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:6, fontFamily:"monospace",
                        background: m.hkc?"rgba(29,158,117,0.1)":"rgba(143,168,178,0.08)",
                        color: m.hkc?"#1D9E75":"#8FA8B2"}}>
                        {m.hkc?"✓":"–"}
                      </span>
                    </td>
                    <td style={{padding:"11px 16px", fontSize:11, color:"#8FA8B2"}}>{m.tide}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        {/* DETAIL PANEL */}
        {selM && (
          <aside style={{width:260, background:"#0F2733", borderLeft:"1px solid rgba(143,168,178,0.12)", padding:20, overflowY:"auto", flexShrink:0}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Market Detail</div>
              <button onClick={()=>setSel(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:20}}>×</button>
            </div>

            <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:16}}>
              <span style={{fontSize:32}}>{selM.flag}</span>
              <div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:18, fontWeight:700, color:"#E8F0F3"}}>{selM.name}</div>
                <div style={{fontSize:12, color:"#8FA8B2"}}>{selM.country}</div>
              </div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:14, marginBottom:12, textAlign:"center"}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>Current price</div>
              <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:32, fontWeight:700, color:"#1D9E75"}}>{C.symbol}{cv(selM.price)}</div>
              <div style={{fontSize:11, color:"#8FA8B2"}}>per LDT</div>
              <div style={{marginTop:8, fontSize:12, fontWeight:600, color: selM.change>0?"#4ADE80":"#F87171"}}>
                {selM.change>0?"▲":"▼"} {Math.abs(selM.change)} this week
              </div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>9-month history</div>
              <svg width="100%" height={50} viewBox="0 0 220 50">
                {(()=>{
                  const d = selM.history;
                  const mn = Math.min(...d), mx = Math.max(...d);
                  const pts = d.map((v,i)=>{
                    const x=(i/(d.length-1))*216+2;
                    const y=48-((v-mn)/(mx-mn||1))*44;
                    return x+","+y;
                  }).join(" ");
                  const last = pts.split(" ").pop()?.split(",") || ["0","0"];
                  return (<>
                    <polyline points={pts} fill="none" stroke="#1D9E75" strokeWidth={2} strokeLinejoin="round"/>
                    <circle cx={last[0]} cy={last[1]} r={4} fill="#1D9E75"/>
                  </>);
                })()}
              </svg>
              <div style={{display:"flex", justifyContent:"space-between", marginTop:4}}>
                {months.map(m=><span key={m} style={{fontSize:7, color:"rgba(143,168,178,0.4)", fontFamily:"monospace"}}>{m}</span>)}
              </div>
            </div>

            {[["Active yards",selM.yards+" yards"],["Steel price",C.symbol+cv(selM.steel)+"/ton"],["Volume",selM.volume+" vessels/mo"],["HKC",selM.hkc?"✓ Certified":"Pending"],["Beaching",selM.tide]].map(([l,v])=>(
              <div key={String(l)} style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
                <span style={{fontSize:11, color:"#8FA8B2"}}>{l}</span>
                <span style={{fontSize:11, fontWeight:500, color: String(l)==="HKC" && selM.hkc?"#1D9E75":"#E8F0F3"}}>{String(v)}</span>
              </div>
            ))}

            <button style={{width:"100%", background:"#1D9E75", border:"none", borderRadius:10, padding:11, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", marginTop:12}}>
              Find vessels for {selM.name} →
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}