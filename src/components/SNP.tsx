"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const listings = [
  { id:1, name:"MV ATLANTIC PIONEER", type:"Bulk Carrier", flag:"🇬🇷 Greece", year:2008, age:18, dwt:75400, ldt:9800, price:12500000, asking:13200000, status:"For Sale", condition:"Good", classification:"DNV GL", lastSurvey:"2024", port:"Piraeus", owner:"Aegean Bulk Ltd", email:"fleet@aegeanbulk.gr", score:82, region:"Mediterranean", notes:"Ready for immediate delivery. Class maintained." },
  { id:2, name:"MV PACIFIC GLORY", type:"Oil Tanker", flag:"🇯🇵 Japan", year:2011, age:15, dwt:105000, ldt:14200, price:28000000, asking:29500000, status:"For Sale", condition:"Excellent", classification:"ClassNK", lastSurvey:"2025", port:"Tokyo", owner:"Nippon Marine", email:"sales@nipponmarine.jp", score:91, region:"Asia Pacific", notes:"Japanese maintained. Full survey records available." },
  { id:3, name:"MV NORDIC STAR", type:"General Cargo", flag:"🇳🇴 Norway", year:2006, age:20, dwt:18500, ldt:4200, price:4200000, asking:4500000, status:"Under Offer", condition:"Good", classification:"DNV GL", lastSurvey:"2023", port:"Bergen", owner:"Nordic Shipping AS", email:"sales@nordicshipping.no", score:75, region:"North Europe", notes:"Price negotiable. Motivated seller." },
  { id:4, name:"MV GOLDEN HORIZON", type:"Container Ship", flag:"🇩🇪 Germany", year:2013, age:13, dwt:42000, ldt:8100, price:18500000, asking:19800000, status:"For Sale", condition:"Very Good", classification:"GL", lastSurvey:"2024", port:"Hamburg", owner:"Hamburg Container Lines", email:"fleet@hcl.de", score:88, region:"North Europe", notes:"2,800 TEU. All holds clean." },
  { id:5, name:"MV CORAL SEA", type:"Bulk Carrier", flag:"🇨🇳 China", year:2009, age:17, dwt:58000, ldt:7900, price:9800000, asking:10500000, status:"For Sale", condition:"Fair", classification:"CCS", lastSurvey:"2023", port:"Shanghai", owner:"Sinoship Group", email:"fleet@sinoship.cn", score:79, region:"Asia Pacific", notes:"Survey due 2026. Price reflects condition." },
  { id:6, name:"MV MARE NOSTRUM", type:"Oil Tanker", flag:"🇬🇷 Greece", year:2015, age:11, dwt:115000, ldt:15800, price:42000000, asking:44500000, status:"For Sale", condition:"Excellent", classification:"BV", lastSurvey:"2025", port:"Piraeus", owner:"Hellenic Tankers", email:"sales@hellenictankers.gr", score:94, region:"Mediterranean", notes:"Eco vessel. Scrubber fitted." },
  { id:7, name:"MV AMBER WAVE", type:"Bulk Carrier", flag:"🇸🇬 Singapore", year:2007, age:19, dwt:82000, ldt:10900, price:11200000, asking:12000000, status:"For Sale", condition:"Good", classification:"LR", lastSurvey:"2024", port:"Singapore", owner:"Pacific Bulk Holdings", email:"fleet@pacificbulk.sg", score:83, region:"Asia Pacific", notes:"BWTS fitted. Ready for delivery." },
  { id:8, name:"MV EURO TRADER", type:"General Cargo", flag:"🇳🇱 Netherlands", year:2010, age:16, dwt:12400, ldt:3100, price:3800000, asking:4100000, status:"Under Offer", condition:"Good", classification:"BV", lastSurvey:"2024", port:"Rotterdam", owner:"Dutch Cargo BV", email:"sales@dutchcargo.nl", score:77, region:"North Europe", notes:"Coaster. Box shaped holds." },
];

const scoreColor = (s: number) => s >= 90 ? "#4ADE80" : s >= 80 ? "#6CB8E6" : s >= 70 ? "#FACC15" : "#8FA8B2";
const scoreLabel = (s: number) => s >= 90 ? "Premium" : s >= 80 ? "Good" : s >= 70 ? "Fair" : "Below Avg";

const regions = ["All Regions", "Mediterranean", "Asia Pacific", "North Europe"];
const types = ["All Types", "Bulk Carrier", "Oil Tanker", "General Cargo", "Container Ship"];

export default function SNP() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All Regions");
  const [type, setType] = useState("All Types");
  const [maxPrice, setMaxPrice] = useState(50);
  const [selected, setSelected] = useState<typeof listings[0] | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const filtered = listings.filter(v =>
    (region === "All Regions" || v.region === region) &&
    (type === "All Types" || v.type === type) &&
    v.price <= maxPrice * 1000000 &&
    (v.name.toLowerCase().includes(search.toLowerCase()) ||
     v.owner.toLowerCase().includes(search.toLowerCase()))
  );

  const totalValue = filtered.reduce((a, v) => a + v.price, 0);

  return (
    <div style={{fontFamily:"Inter, sans-serif", minHeight:"100vh", background:"#0D1F28", color:"#E8F0F3"}}>

      {/* EMAIL MODAL */}
      {showEmail && selected && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:24}}>
          <div style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.2)", borderRadius:16, width:"100%", maxWidth:560, overflow:"hidden"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
              <div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700}}>Purchase Inquiry</div>
                <div style={{fontSize:12, color:"#8FA8B2", marginTop:2}}>{selected.name} · {selected.owner}</div>
              </div>
              <button onClick={()=>setShowEmail(false)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:22}}>×</button>
            </div>
            <div style={{padding:20}}>
              <textarea defaultValue={`Subject: Purchase Inquiry — ${selected.name}

Dear ${selected.owner},

We are interested in acquiring the ${selected.name} (${selected.type}, built ${selected.year}, ${selected.dwt.toLocaleString()} DWT).

We have reviewed the vessel particulars and would like to discuss the terms of purchase. We are serious buyers and can move quickly.

Could you please provide:
1. Latest condition survey report
2. Class certificates
3. Full maintenance records
4. Your best price for immediate transaction

We look forward to your response.

Best regards,
ShipScout Maritime`}
                style={{width:"100%", height:260, background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.2)", borderRadius:10, padding:14, color:"#E8F0F3", fontSize:13, lineHeight:1.7, resize:"vertical", outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}} />
            </div>
            <div style={{padding:"12px 20px", borderTop:"1px solid rgba(143,168,178,0.12)", display:"flex", gap:8, justifyContent:"flex-end"}}>
              <button onClick={()=>setShowEmail(false)} style={{background:"rgba(143,168,178,0.08)", border:"1px solid rgba(143,168,178,0.2)", borderRadius:8, padding:"9px 16px", color:"#8FA8B2", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>Cancel</button>
              <button onClick={()=>{setEmailSent(true); setTimeout(()=>{setShowEmail(false); setEmailSent(false);},1500);}}
                style={{background:emailSent?"#0F6E56":"#185FA5", border:"none", borderRadius:8, padding:"9px 20px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                {emailSent ? "✓ Sent!" : `Send to ${selected.email}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav style={{background:"#0D1F28", borderBottom:"1px solid rgba(143,168,178,0.15)", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:50}}>
        <div style={{display:"flex", alignItems:"center", gap:28}}>
          <div style={{fontFamily:"Space Grotesk, sans-serif", fontWeight:700, fontSize:18, letterSpacing:-0.5}}>
            <span style={{color:"#E8F0F3"}}>Ship</span><span style={{color:"#1D9E75"}}>Scout</span>
          </div>
          {[["Vessels","/"],["Markets","/markets"],["Map","/map"],["S&P","/snp"],["Deal CRM","/crm"],["Alerts","/alerts"]].map(([t,h])=>(
            <a key={t} href={h} style={{color:t==="S&P"?"#6CB8E6":"#8FA8B2", fontSize:13, fontWeight:500, textDecoration:"none", borderBottom:t==="S&P"?"2px solid #6CB8E6":"2px solid transparent", paddingBottom:2}}>{t}</a>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <div style={{fontSize:11, color:"#8FA8B2"}}>{filtered.length} vessels · Total: <span style={{color:"#6CB8E6", fontWeight:600}}>${(totalValue/1000000).toFixed(1)}M</span></div>
          <div style={{width:32, height:32, borderRadius:"50%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"#1D9E75"}}>T</div>
        </div>
      </nav>

      <div style={{display:"flex", height:"calc(100vh - 56px)"}}>

        {/* SIDEBAR */}
        <aside style={{width:220, background:"#0F2733", borderRight:"1px solid rgba(143,168,178,0.12)", padding:20, flexShrink:0, overflowY:"auto"}}>
          <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:16}}>Filters</div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:6}}>Search</div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Vessel or owner..."
              style={{width:"100%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.18)", borderRadius:8, padding:"8px 10px", color:"#E8F0F3", fontSize:12, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}} />
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:8}}>Region</div>
            {regions.map(r=>(
              <button key={r} onClick={()=>setRegion(r)} style={{display:"block", width:"100%", textAlign:"left", background:region===r?"rgba(108,184,230,0.12)":"none", border:region===r?"1px solid rgba(108,184,230,0.3)":"1px solid transparent", borderRadius:6, padding:"6px 10px", color:region===r?"#6CB8E6":"#8FA8B2", fontSize:12, cursor:"pointer", marginBottom:3, fontFamily:"Inter, sans-serif"}}>{r}</button>
            ))}
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:8}}>Vessel type</div>
            {types.map(t=>(
              <button key={t} onClick={()=>setType(t)} style={{display:"block", width:"100%", textAlign:"left", background:type===t?"rgba(108,184,230,0.12)":"none", border:type===t?"1px solid rgba(108,184,230,0.3)":"1px solid transparent", borderRadius:6, padding:"6px 10px", color:type===t?"#6CB8E6":"#8FA8B2", fontSize:12, cursor:"pointer", marginBottom:3, fontFamily:"Inter, sans-serif"}}>{t}</button>
            ))}
          </div>

          <div style={{marginBottom:20}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
              <div style={{fontSize:11, color:"#8FA8B2"}}>Max price</div>
              <div style={{fontSize:11, color:"#6CB8E6", fontWeight:600}}>${maxPrice}M</div>
            </div>
            <input type="range" min={1} max={50} step={1} value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))} style={{width:"100%", accentColor:"#6CB8E6"}} />
          </div>

          <div style={{borderTop:"1px solid rgba(143,168,178,0.12)", paddingTop:16}}>
            <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:12}}>Market summary</div>
            {[
              ["For Sale", listings.filter(v=>v.status==="For Sale").length+" vessels"],
              ["Under Offer", listings.filter(v=>v.status==="Under Offer").length+" vessels"],
              ["Avg price", "$"+(listings.reduce((a,v)=>a+v.price,0)/listings.length/1000000).toFixed(1)+"M"],
              ["Total value", "$"+(listings.reduce((a,v)=>a+v.price,0)/1000000).toFixed(0)+"M"],
            ].map(([l,v])=>(
              <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
                <span style={{fontSize:12, color:"#8FA8B2"}}>{l}</span>
                <span style={{fontSize:12, fontWeight:600, color:"#E8F0F3"}}>{v}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{flex:1, overflowY:"auto", padding:24}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20}}>
            <div>
              <h1 style={{fontFamily:"Space Grotesk, sans-serif", fontSize:22, fontWeight:700, letterSpacing:-0.5, margin:0}}>Sale & Purchase</h1>
              <div style={{fontSize:12, color:"#8FA8B2", marginTop:2}}>{filtered.length} vessels for sale · sorted by S&P score</div>
            </div>
            <div style={{display:"flex", gap:8}}>
              <button style={{background:"rgba(108,184,230,0.08)", border:"1px solid rgba(108,184,230,0.2)", borderRadius:8, padding:"8px 16px", color:"#6CB8E6", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>↓ Export list</button>
              <button style={{background:"#185FA5", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>+ List vessel</button>
            </div>
          </div>

          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {filtered.sort((a,b)=>b.score-a.score).map(v=>(
              <div key={v.id} onClick={()=>setSelected(v.id===selected?.id?null:v)}
                style={{
                  background:selected?.id===v.id?"#1A3A4A":"#0F2733",
                  border:selected?.id===v.id?"1px solid rgba(108,184,230,0.4)":"1px solid rgba(143,168,178,0.12)",
                  borderRadius:12, padding:"14px 18px", cursor:"pointer", transition:"all 0.15s",
                  display:"grid", gridTemplateColumns:"64px 1px 1fr auto auto", gap:16, alignItems:"center"
                }}>

                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:26, fontWeight:700, fontFamily:"Space Grotesk, sans-serif", color:scoreColor(v.score), lineHeight:1}}>{v.score}</div>
                  <div style={{fontSize:9, fontWeight:600, color:scoreColor(v.score), fontFamily:"monospace", letterSpacing:"0.06em", marginTop:2}}>{scoreLabel(v.score)}</div>
                </div>

                <div style={{width:1, height:40, background:"rgba(143,168,178,0.12)"}}></div>

                <div>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
                    <span style={{fontFamily:"Space Grotesk, sans-serif", fontSize:14, fontWeight:700, color:"#E8F0F3"}}>{v.name}</span>
                    <span style={{fontSize:11, padding:"2px 8px", borderRadius:20, fontFamily:"monospace",
                      background:v.status==="For Sale"?"rgba(108,184,230,0.12)":"rgba(250,204,21,0.12)",
                      color:v.status==="For Sale"?"#6CB8E6":"#FACC15",
                      border:v.status==="For Sale"?"1px solid rgba(108,184,230,0.25)":"1px solid rgba(250,204,21,0.25)"}}>
                      {v.status}
                    </span>
                    <span style={{fontSize:11, padding:"2px 8px", borderRadius:20, fontFamily:"monospace", background:"rgba(143,168,178,0.08)", color:"#8FA8B2", border:"1px solid rgba(143,168,178,0.15)"}}>
                      {v.condition}
                    </span>
                  </div>
                  <div style={{display:"flex", gap:12, fontSize:12, color:"#8FA8B2", flexWrap:"wrap"}}>
                    <span>{v.type}</span>
                    <span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>{v.flag}</span>
                    <span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>Built {v.year} · {v.age} yrs</span>
                    <span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>{v.dwt.toLocaleString()} DWT</span>
                    <span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>{v.classification}</span>
                    <span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>📍 {v.port}</span>
                  </div>
                </div>

                <div style={{textAlign:"right", minWidth:140}}>
                  <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:18, fontWeight:700, color:"#6CB8E6", letterSpacing:-0.5}}>${(v.price/1000000).toFixed(1)}M</div>
                  <div style={{fontSize:11, color:"#8FA8B2", marginTop:2, textDecoration:"line-through"}}>${(v.asking/1000000).toFixed(1)}M asking</div>
                </div>

                <button onClick={e=>{e.stopPropagation(); setSelected(v); setShowEmail(true);}}
                  style={{background:"#185FA5", border:"none", borderRadius:8, padding:"8px 14px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", whiteSpace:"nowrap"}}>
                  Make offer →
                </button>
              </div>
            ))}
          </div>
        </main>

        {/* DETAIL PANEL */}
        {selected && (
          <aside style={{width:300, background:"#0F2733", borderLeft:"1px solid rgba(143,168,178,0.12)", padding:20, overflowY:"auto", flexShrink:0}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Vessel Profile</div>
              <button onClick={()=>setSelected(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:20}}>×</button>
            </div>

            <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700, color:"#E8F0F3", marginBottom:3}}>{selected.name}</div>
            <div style={{fontSize:12, color:"#8FA8B2", marginBottom:14}}>{selected.type} · {selected.flag}</div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(108,184,230,0.2)", borderRadius:10, padding:14, marginBottom:12, textAlign:"center"}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4}}>Indicative price</div>
              <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:28, fontWeight:700, color:"#6CB8E6"}}>${(selected.price/1000000).toFixed(2)}M</div>
              <div style={{fontSize:11, color:"#8FA8B2", marginTop:2}}>Asking: ${(selected.asking/1000000).toFixed(1)}M</div>
              <div style={{marginTop:8, fontSize:11, color:"#4ADE80", fontWeight:600}}>
                Potential saving: ${((selected.asking-selected.price)/1000).toFixed(0)}k
              </div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Vessel particulars</div>
              {[
                ["Build year", selected.year],
                ["Age", `${selected.age} years`],
                ["DWT", `${selected.dwt.toLocaleString()} t`],
                ["LDT", `${selected.ldt.toLocaleString()} t`],
                ["Classification", selected.classification],
                ["Last survey", selected.lastSurvey],
                ["Condition", selected.condition],
                ["Port", selected.port],
                ["Region", selected.region],
              ].map(([l,v])=>(
                <div key={String(l)} style={{display:"flex", justifyContent:"space-between", marginBottom:7, gap:8}}>
                  <span style={{fontSize:11, color:"#8FA8B2"}}>{l}</span>
                  <span style={{fontSize:11, fontWeight:500, color:"#E8F0F3", textAlign:"right"}}>{String(v)}</span>
                </div>
              ))}
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Owner / Broker</div>
              <div style={{fontSize:13, fontWeight:600, color:"#E8F0F3", marginBottom:4}}>{selected.owner}</div>
              <div style={{fontSize:11, color:"#6CB8E6", marginBottom:8}}>{selected.email}</div>
              {selected.notes && (
                <div style={{fontSize:11, color:"#8FA8B2", lineHeight:1.5, fontStyle:"italic"}}>"{selected.notes}"</div>
              )}
            </div>

            <div style={{background:"rgba(29,158,117,0.06)", border:"1px solid rgba(29,158,117,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#1D9E75", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Scrap value reference</div>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                <span style={{fontSize:11, color:"#8FA8B2"}}>Alang scrap value</span>
                <span style={{fontSize:11, fontWeight:600, color:"#1D9E75"}}>${(selected.ldt*500/1000000).toFixed(1)}M</span>
              </div>
              <div style={{display:"flex", justifyContent:"space-between"}}>
                <span style={{fontSize:11, color:"#8FA8B2"}}>S&P premium</span>
                <span style={{fontSize:11, fontWeight:600, color:"#6CB8E6"}}>${((selected.price-selected.ldt*500)/1000000).toFixed(1)}M above scrap</span>
              </div>
            </div>

            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <button onClick={()=>setShowEmail(true)}
                style={{background:"#185FA5", border:"none", borderRadius:10, padding:11, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                ✉️ Make offer →
              </button>
              <button onClick={()=>router.push("/crm")}
                style={{background:"rgba(108,184,230,0.08)", border:"1px solid rgba(108,184,230,0.2)", borderRadius:10, padding:11, color:"#6CB8E6", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                📋 Add to CRM
              </button>
              <button
                style={{background:"rgba(29,158,117,0.08)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:11, color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                🔒 Open escrow
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}