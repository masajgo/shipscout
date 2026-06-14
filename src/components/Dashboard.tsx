"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const vessels = [
  { id:1, name:"MV PACIFIC TRADER", type:"Bulk Carrier", flag:"🇬🇷 Greece", year:2001, age:25, ldt:8420, score:87, port:"Piraeus", idle:47, status:"Idle", owner:"Danaos Shipping", email:"fleet@danaos.gr", verified:true },
  { id:2, name:"MV CORAL STAR", type:"General Cargo", flag:"🇯🇵 Japan", year:1999, age:27, ldt:5180, score:91, port:"Singapore", idle:63, status:"Idle", owner:"Pacific Lines Ltd", email:"ops@pacificlines.jp", verified:true },
  { id:3, name:"MV NORSE VIKING", type:"Oil Tanker", flag:"🇳🇴 Norway", year:2000, age:26, ldt:12740, score:83, port:"Rotterdam", idle:31, status:"Slow", owner:"Bergesen Maritime", email:"chartering@bergesen.no", verified:false },
  { id:4, name:"MV ATLAS GLORY", type:"Container Ship", flag:"🇩🇪 Germany", year:2002, age:24, ldt:6890, score:79, port:"Hamburg", idle:22, status:"Slow", owner:"Hapag Trading", email:"ops@hapagtrading.de", verified:true },
  { id:5, name:"MV EASTERN SUN", type:"Bulk Carrier", flag:"🇨🇳 China", year:1998, age:28, ldt:9310, score:94, port:"Shanghai", idle:88, status:"Idle", owner:"Sinoship Group", email:"fleet@sinoship.cn", verified:false },
  { id:6, name:"MV ADRIATIC HOPE", type:"General Cargo", flag:"🇬🇷 Greece", year:2003, age:23, ldt:4250, score:71, port:"Piraeus", idle:18, status:"Active", owner:"Aegean Maritime", email:"ops@aegeanmaritime.gr", verified:true },
];

type Vessel = typeof vessels[0];
const scoreLabel = (s: number) => s >= 90 ? "Critical" : s >= 80 ? "High" : "Medium";
const scoreColor = (s: number) => s >= 90 ? "#F87171" : s >= 80 ? "#FB923C" : "#FACC15";

export default function Dashboard() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState<number|null>(null);
  const [emailModal, setEmailModal] = useState<Vessel|null>(null);
  const [emailContent, setEmailContent] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const types = ["All", "Bulk Carrier", "Oil Tanker", "General Cargo", "Container Ship"];
  const filtered = vessels.filter(v =>
    (typeFilter === "All" || v.type === typeFilter) &&
    v.score >= minScore &&
    (v.name.toLowerCase().includes(search.toLowerCase()) || v.owner.toLowerCase().includes(search.toLowerCase()))
  );
  const sel = vessels.find(v => v.id === selected);

  const language = (flag: string) =>
    flag.includes("Greece") ? "Greek" :
    flag.includes("Japan") ? "Japanese" :
    flag.includes("Norway") ? "Norwegian" : "English";

  const demoEmail = (v: Vessel) => {
    const lang = language(v.flag);
    const value = Math.round(v.ldt * 330).toLocaleString();
    const subjects: Record<string, string> = {
      Greek: `Θέμα: Πρόταση Αγοράς - ${v.name}`,
      Japanese: `件名: 船舶購入提案 - ${v.name}`,
      Norwegian: `Emne: Kjøpstilbud - ${v.name}`,
    };
    const subject = subjects[lang] ?? `Subject: Purchase Offer - ${v.name}`;
    return `${subject}

Dear Ship Owner,

We represent an HKC-certified ship recycling facility in Aliağa, Turkey. Following our market analysis, we are interested in acquiring the ${v.name} (${v.type}, built ${v.year}).

Estimated total value: $${value} USD based on current Aliağa scrap price of $330/LDT.

We are ready for immediate transaction. Please contact us to discuss terms and conditions.

Best regards,
ShipScout Maritime`;
  };

  const handleDraftEmail = (v: Vessel) => {
    setEmailModal(v);
    setEmailContent("");
    setEmailSent(false);
    setEmailLoading(true);
    setTimeout(() => {
      setEmailContent(demoEmail(v));
      setEmailLoading(false);
    }, 1500);
  };

  return (
    <div style={{fontFamily:"Inter, sans-serif", minHeight:"100vh", background:"#0D1F28", color:"#E8F0F3"}}>

      {/* EMAIL MODAL */}
      {emailModal && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:24}}>
          <div style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.2)", borderRadius:16, width:"100%", maxWidth:600, maxHeight:"90vh", overflow:"hidden", display:"flex", flexDirection:"column"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
              <div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700, color:"#E8F0F3"}}>Draft Offer Email</div>
                <div style={{fontSize:12, color:"#8FA8B2", marginTop:2}}>{emailModal.name} · {emailModal.owner} · {language(emailModal.flag)}</div>
              </div>
              <button onClick={()=>setEmailModal(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:22}}>×</button>
            </div>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, padding:"12px 20px", borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
              {[["Vessel", emailModal.name.split(" ").slice(-2).join(" ")],["LDT", emailModal.ldt.toLocaleString()],["Est. value","$"+(emailModal.ldt*330/1000).toFixed(0)+"k"],["Language", language(emailModal.flag)]].map(([l,v])=>(
                <div key={l} style={{background:"#1A3A4A", borderRadius:8, padding:"8px 10px"}}>
                  <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3}}>{l}</div>
                  <div style={{fontSize:12, fontWeight:600, color:"#E8F0F3"}}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{flex:1, overflowY:"auto", padding:20}}>
              {emailLoading ? (
                <div style={{textAlign:"center", padding:40}}>
                  <div style={{fontSize:12, color:"#1D9E75", fontFamily:"monospace", marginBottom:16}}>● AI writing in {language(emailModal.flag)}...</div>
                  <div style={{display:"flex", justifyContent:"center", gap:6}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8, height:8, borderRadius:"50%", background:"#1D9E75", opacity:0.4}}></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <textarea value={emailContent} onChange={e=>setEmailContent(e.target.value)}
                    style={{width:"100%", minHeight:260, background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.2)", borderRadius:10, padding:16, color:"#E8F0F3", fontSize:13, lineHeight:1.7, resize:"vertical", outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}} />
                  <div style={{fontSize:11, color:"#8FA8B2", marginTop:8}}>✏️ Edit the email above before sending</div>
                </div>
              )}
            </div>

            <div style={{padding:"12px 20px", borderTop:"1px solid rgba(143,168,178,0.12)", display:"flex", gap:8, alignItems:"center"}}>
              <button onClick={()=>handleDraftEmail(emailModal)} style={{background:"rgba(143,168,178,0.08)", border:"1px solid rgba(143,168,178,0.2)", borderRadius:8, padding:"9px 14px", color:"#8FA8B2", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>↺ Regenerate</button>
              <div style={{flex:1}}></div>
              <button onClick={()=>router.push("/crm")} style={{background:"rgba(29,158,117,0.1)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:8, padding:"9px 14px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>📋 Add to CRM</button>
              <button onClick={()=>{setEmailSent(true); setTimeout(()=>setEmailModal(null),1500);}}
                style={{background: emailSent?"#0F6E56":"#1D9E75", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                {emailSent ? "✓ Sent!" : `Send to ${emailModal.email}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav style={{background:"#0D1F28", borderBottom:"1px solid rgba(143,168,178,0.15)", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:50}}>
        <div style={{display:"flex", alignItems:"center", gap:32}}>
          <div style={{fontFamily:"Space Grotesk, sans-serif", fontWeight:700, fontSize:18, letterSpacing:-0.5}}>
            <span style={{color:"#E8F0F3"}}>Ship</span><span style={{color:"#1D9E75"}}>Scout</span>
          </div>
          {[["Vessels","/"],["Markets","/markets"],["Deal CRM","/crm"],["Alerts","/alerts"]].map(([t,h])=>(
            <a key={t} href={h} style={{color: t==="Vessels"?"#1D9E75":"#8FA8B2", fontSize:13, fontWeight:500, textDecoration:"none", borderBottom: t==="Vessels"?"2px solid #1D9E75":"2px solid transparent", paddingBottom:2}}>{t}</a>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <div style={{fontSize:12, color:"#8FA8B2"}}><span style={{color:"#1D9E75", fontWeight:600}}>● </span>Live scanning</div>
          <div style={{width:32, height:32, borderRadius:"50%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"#1D9E75"}}>T</div>
        </div>
      </nav>

      <div style={{display:"flex", height:"calc(100vh - 56px)"}}>

        {/* SIDEBAR */}
        <aside style={{width:220, background:"#0F2733", borderRight:"1px solid rgba(143,168,178,0.12)", padding:20, flexShrink:0, overflowY:"auto"}}>
          <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:16}}>Filters</div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:6, fontWeight:500}}>Search</div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Vessel or owner..."
              style={{width:"100%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.18)", borderRadius:8, padding:"8px 10px", color:"#E8F0F3", fontSize:12, outline:"none", fontFamily:"Inter, sans-serif", boxSizing:"border-box"}} />
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:8, fontWeight:500}}>Vessel type</div>
            {types.map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} style={{display:"block", width:"100%", textAlign:"left", background: typeFilter===t?"rgba(29,158,117,0.12)":"none", border: typeFilter===t?"1px solid rgba(29,158,117,0.3)":"1px solid transparent", borderRadius:6, padding:"6px 10px", color: typeFilter===t?"#1D9E75":"#8FA8B2", fontSize:12, cursor:"pointer", marginBottom:4, fontFamily:"Inter, sans-serif"}}>{t}</button>
            ))}
          </div>

          <div style={{marginBottom:20}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
              <div style={{fontSize:11, color:"#8FA8B2", fontWeight:500}}>Min scrap score</div>
              <div style={{fontSize:11, color:"#1D9E75", fontWeight:600}}>{minScore}+</div>
            </div>
            <input type="range" min={0} max={90} step={5} value={minScore} onChange={e=>setMinScore(Number(e.target.value))} style={{width:"100%", accentColor:"#1D9E75"}} />
            <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:"rgba(143,168,178,0.5)", marginTop:4}}><span>0</span><span>90+</span></div>
          </div>

          <div style={{borderTop:"1px solid rgba(143,168,178,0.12)", paddingTop:16}}>
            <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:12}}>Today</div>
            {[["Vessels scanned","15,847"],["High score (80+)","342"],["Offers sent","28"],["Replies","6"]].map(([l,v])=>(
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
              <h1 style={{fontFamily:"Space Grotesk, sans-serif", fontSize:22, fontWeight:700, letterSpacing:-0.5, margin:0}}>Vessel Scout</h1>
              <div style={{fontSize:12, color:"#8FA8B2", marginTop:2}}>{filtered.length} candidates matched · sorted by scrap score</div>
            </div>
            <div style={{display:"flex", gap:8}}>
              <button style={{background:"rgba(29,158,117,0.08)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:8, padding:"8px 16px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>↓ Export list</button>
              <button style={{background:"#1D9E75", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>+ Run new scan</button>
            </div>
          </div>

          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {filtered.map(v=>(
              <div key={v.id} onClick={()=>setSelected(v.id===selected?null:v.id)}
                style={{background: selected===v.id?"#1A3A4A":"#0F2733", border: selected===v.id?"1px solid rgba(29,158,117,0.4)":"1px solid rgba(143,168,178,0.12)", borderRadius:12, padding:"14px 18px", cursor:"pointer", transition:"all 0.15s", display:"grid", gridTemplateColumns:"64px 1px 1fr auto auto", gap:16, alignItems:"center"}}>

                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:26, fontWeight:700, fontFamily:"Space Grotesk, sans-serif", color:scoreColor(v.score), lineHeight:1}}>{v.score}</div>
                  <div style={{fontSize:9, fontWeight:600, color:scoreColor(v.score), fontFamily:"monospace", letterSpacing:"0.06em", marginTop:2}}>{scoreLabel(v.score)}</div>
                </div>

                <div style={{width:1, height:40, background:"rgba(143,168,178,0.12)"}}></div>

                <div>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
                    <span style={{fontFamily:"Space Grotesk, sans-serif", fontSize:14, fontWeight:700, color:"#E8F0F3"}}>{v.name}</span>
                    <span style={{fontSize:11, padding:"2px 8px", borderRadius:20, fontFamily:"monospace",
                      background: v.status==="Idle"?"rgba(248,113,113,0.12)":v.status==="Slow"?"rgba(251,146,60,0.12)":"rgba(74,222,128,0.12)",
                      color: v.status==="Idle"?"#F87171":v.status==="Slow"?"#FB923C":"#4ADE80",
                      border: v.status==="Idle"?"1px solid rgba(248,113,113,0.25)":v.status==="Slow"?"1px solid rgba(251,146,60,0.25)":"1px solid rgba(74,222,128,0.25)"}}>
                      {v.status==="Idle"?`Idle ${v.idle}d`:v.status==="Slow"?"Slow steam":"Active"}
                    </span>
                  </div>
                  <div style={{display:"flex", gap:12, fontSize:12, color:"#8FA8B2", flexWrap:"wrap"}}>
                    <span>{v.type}</span><span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>{v.flag}</span><span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>Built {v.year} · {v.age} yrs</span><span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>{v.ldt.toLocaleString()} LDT</span><span style={{color:"rgba(143,168,178,0.3)"}}>·</span>
                    <span>Last port: {v.port}</span>
                  </div>
                </div>

                <div style={{textAlign:"right", minWidth:140}}>
                  <div style={{fontSize:12, fontWeight:600, color:"#E8F0F3", marginBottom:3}}>{v.owner}</div>
                  <div style={{fontSize:11, color: v.verified?"#1D9E75":"#8FA8B2"}}>{v.verified?"✓ Verified":"~ Likely"}</div>
                </div>

                <button onClick={e=>{e.stopPropagation(); setSelected(v.id); handleDraftEmail(v);}}
                  style={{background:"#1D9E75", border:"none", borderRadius:8, padding:"8px 14px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", whiteSpace:"nowrap"}}>
                  Contact owner →
                </button>
              </div>
            ))}
          </div>
        </main>

        {/* DETAIL PANEL */}
        {sel && !emailModal && (
          <aside style={{width:300, background:"#0F2733", borderLeft:"1px solid rgba(143,168,178,0.12)", padding:20, overflowY:"auto", flexShrink:0}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Vessel Profile</div>
              <button onClick={()=>setSelected(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:20}}>×</button>
            </div>

            <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:16, fontWeight:700, color:"#E8F0F3", marginBottom:3, letterSpacing:-0.3}}>{sel.name}</div>
            <div style={{fontSize:12, color:"#8FA8B2", marginBottom:20}}>{sel.type} · {sel.flag}</div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Scrap Score</div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:26, fontWeight:700, color:scoreColor(sel.score)}}>{sel.score}<span style={{fontSize:12, color:"#8FA8B2"}}>/100</span></div>
              </div>
              <div style={{height:4, background:"rgba(143,168,178,0.1)", borderRadius:2, overflow:"hidden", marginBottom:10}}>
                <div style={{height:"100%", width:`${sel.score}%`, background:scoreColor(sel.score), borderRadius:2}}></div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                {[["Age","38/40","#1D9E75"],["Idle","22/25","#FB923C"],["Survey","18/20","#F87171"],["Market","9/15","#6CB8E6"]].map(([l,val,c])=>(
                  <div key={l}>
                    <div style={{fontSize:10, color:"#8FA8B2", fontFamily:"monospace", marginBottom:3}}>{l} · {val}</div>
                    <div style={{height:3, background:"rgba(143,168,178,0.1)", borderRadius:2, overflow:"hidden"}}>
                      <div style={{height:"100%", width:`${parseInt(val)*100/parseInt(val.split("/")[1])}%`, background:c, borderRadius:2}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12}}>Vessel Details</div>
              {[["Build year",String(sel.year)],["Age",`${sel.age} years`],["Est. LDT",`${sel.ldt.toLocaleString()} LDT`],["Last port",sel.port],["Idle days",`${sel.idle} days`],["Status",sel.status]].map(([l,v])=>(
                <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
                  <span style={{fontSize:12, color:"#8FA8B2"}}>{l}</span>
                  <span style={{fontSize:12, fontWeight:500, color:"#E8F0F3"}}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Owner Contact</div>
              <div style={{fontSize:13, fontWeight:600, color:"#E8F0F3", marginBottom:3}}>{sel.owner}</div>
              <div style={{fontSize:11, color: sel.verified?"#1D9E75":"#8FA8B2", marginBottom:6}}>{sel.verified?"✓ Verified":"~ Likely"} · {sel.email}</div>
              <div style={{fontSize:11, color:"#8FA8B2"}}>Language: {language(sel.flag)}</div>
            </div>

            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <button onClick={()=>handleDraftEmail(sel)}
                style={{background:"#1D9E75", border:"none", borderRadius:10, padding:"11px 16px", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", textAlign:"left"}}>
                ✉️  Draft offer email →
              </button>
              <button onClick={()=>router.push("/crm")}
                style={{background:"rgba(29,158,117,0.08)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:"11px 16px", color:"#1D9E75", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", textAlign:"left"}}>
                📋  Add to CRM
              </button>
              <button onClick={()=>router.push("/alerts")}
                style={{background:"rgba(143,168,178,0.08)", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:"11px 16px", color:"#8FA8B2", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif", textAlign:"left"}}>
                🔔  Set alert
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}