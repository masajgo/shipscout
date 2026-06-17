"use client";
import { useState } from "react";

const alerts = [
  { id:1,  type:"judicial", priority:"critical", title:"Judicial Auction — MV NIRVANA",         vessel:"MV NIRVANA",          flag:"🇮🇳", imo:"IMO 9187432", ldt:8200,  vesselType:"Oil Tanker",     age:27, market:"Alang",     value:4182000, description:"Gujarat High Court ordered demolition auction. Vessel arrested for unpaid crew wages ($340,000). Clean title — all liens extinguished on sale.", deadline:"Jun 18, 2026", daysLeft:4,  location:"Alang anchorage, India",           court:"Gujarat High Court, Ahmedabad",      reservePrice:3800000, inspection:"Jun 15–17, 2026",   contact:"court.alang@gujarathc.gov.in",    time:"2h ago",  read:false },
  { id:2,  type:"dark",     priority:"high",     title:"AIS Dark — MV EASTERN PROMISE",         vessel:"MV EASTERN PROMISE",  flag:"🇬🇷", imo:"IMO 9302156", ldt:11400, vesselType:"Bulk Carrier",   age:25, market:"Chittagong", value:6162000, description:"Vessel went AIS dark 68nm southwest of Chittagong port. Last known position matches approach corridor. 26-year-old bulk carrier with survey due in 3 months.", deadline:null, daysLeft:null, location:"Bay of Bengal (last known)",  court:null, reservePrice:null, inspection:null, contact:"ops@aegeanshipping.gr",    time:"4h ago",  read:false },
  { id:3,  type:"bank",     priority:"high",     title:"Bank Repo — MV ARCTIC STAR",            vessel:"MV ARCTIC STAR",      flag:"🇳🇴", imo:"IMO 9245871", ldt:9800,  vesselType:"Oil Tanker",     age:24, market:"Aliağa",    value:3234000, description:"DNB Bank Oslo foreclosed on vessel mortgage after 3 missed payments. Bank seeking fast sale. Direct negotiation possible before public auction.", deadline:"Jun 25, 2026", daysLeft:11, location:"Stavanger, Norway",                court:null,                                 reservePrice:2900000, inspection:"By appointment",     contact:"shipping.assets@dnb.no",          time:"1d ago",  read:false },
  { id:4,  type:"idle",     priority:"medium",   title:"Extended Idle — MV PEARL OF ASIA",      vessel:"MV PEARL OF ASIA",    flag:"🇸🇬", imo:"IMO 9156234", ldt:7600,  vesselType:"General Cargo",  age:28, market:"Alang",     value:4104000, description:"Vessel anchored at Singapore Eastern Anchorage for 94 days. No cargo activity detected. Owner (Straits Shipping) has 2 other vessels flagged for sale.", deadline:null, daysLeft:null, location:"Singapore Eastern Anchorage", court:null, reservePrice:null, inspection:null, contact:"ops@straitsshipping.sg",   time:"1d ago",  read:true  },
  { id:5,  type:"judicial", priority:"critical", title:"Admiralty Sale — MV BLUE HORIZON",      vessel:"MV BLUE HORIZON",     flag:"🇸🇬", imo:"IMO 9198745", ldt:6400,  vesselType:"Container Ship", age:26, market:"Alang",     value:3456000, description:"Singapore Admiralty Court ordered sale. Vessel arrested by port authority for $2.1M unpaid port dues. Auction open to international bidders.", deadline:"Jun 22, 2026", daysLeft:8,  location:"Singapore, Jurong Port",           court:"Singapore Admiralty Court",          reservePrice:3100000, inspection:"Jun 18–20, 2026",   contact:"admiralty@supremecourt.gov.sg",   time:"2d ago",  read:true  },
  { id:6,  type:"survey",   priority:"medium",   title:"Survey Due — MV CASPIAN QUEEN",         vessel:"MV CASPIAN QUEEN",    flag:"🇦🇿", imo:"IMO 9267891", ldt:5200,  vesselType:"Oil Tanker",     age:23, market:"Aliağa",    value:1716000, description:"Class renewal survey due in 45 days. Estimated survey cost $380,000. Owner has 2 similar vessels already scrapped this year — pattern suggests demolition decision likely.", deadline:"Jul 28, 2026", daysLeft:44, location:"Baku, Azerbaijan",                 court:null,                                 reservePrice:null,    inspection:null,                contact:"fleet@caspianship.az",            time:"3d ago",  read:true  },
  { id:7,  type:"sanctions",priority:"high",     title:"Sanctioned Vessel — MV SHADOW DANCER",  vessel:"MV SHADOW DANCER",    flag:"🇵🇦", imo:"IMO 9301567", ldt:8900,  vesselType:"Oil Tanker",     age:22, market:"Alang",     value:4806000, description:"Added to OFAC SDN list Jun 2026. Vessel cannot trade — owner seeking judicial sale to extinguish sanctions. Court sale would clear title in most jurisdictions.", deadline:null, daysLeft:null, location:"Unknown (AIS dark)",          court:"Pending — Singapore or India",       reservePrice:null,    inspection:null,                contact:"Legal review required",           time:"5d ago",  read:true  },
  { id:8,  type:"dark",     priority:"medium",   title:"AIS Dark — MV FORTUNE SEEKER",          vessel:"MV FORTUNE SEEKER",   flag:"🇨🇳", imo:"IMO 9234871", ldt:6800,  vesselType:"Bulk Carrier",   age:24, market:"Alang",     value:3672000, description:"AIS dark for 12 days. Last position: Indian Ocean, heading toward Alang approach. 24-year old bulk carrier, class survey overdue by 8 months.", deadline:null, daysLeft:null, location:"Indian Ocean (last known)",   court:null, reservePrice:null, inspection:null, contact:"fleet@chinabulk.cn",       time:"6d ago",  read:true  },
];

const typeConfig: Record<string, { icon:string; label:string; color:string; bg:string; border:string }> = {
  judicial:  { icon:"🏛️", label:"Judicial Sale",  color:"#F04438", bg:"#FEF3F2", border:"#FECDCA" },
  dark:      { icon:"📡", label:"AIS Dark",        color:"#7C3AED", bg:"#F5F3FF", border:"#DDD6FE" },
  bank:      { icon:"🏦", label:"Bank Repo",       color:"#2563EB", bg:"#EFF8FF", border:"#B2DDFF" },
  idle:      { icon:"⚓", label:"Extended Idle",   color:"#DC6803", bg:"#FFFAEB", border:"#FEF0C7" },
  survey:    { icon:"📋", label:"Survey Due",      color:"#DC6803", bg:"#FFFAEB", border:"#FEF0C7" },
  sanctions: { icon:"🚫", label:"Sanctioned",      color:"#F04438", bg:"#FEF3F2", border:"#FECDCA" },
};

const priorityColor: Record<string, string> = {
  critical:"#F04438", high:"#DC6803", medium:"#2563EB",
};

export default function Alerts() {
  const [sel, setSel]           = useState<number|null>(null);
  const [filter, setFilter]     = useState("all");
  const [alertData, setAlertData] = useState(alerts);

  const selA   = alertData.find(a => a.id === sel);
  const unread = alertData.filter(a => !a.read).length;

  const filters = [
    { id:"all",       label:"All alerts", count:alertData.length },
    { id:"judicial",  label:"Judicial",   count:alertData.filter(a => a.type==="judicial").length },
    { id:"dark",      label:"AIS Dark",   count:alertData.filter(a => a.type==="dark").length },
    { id:"bank",      label:"Bank Repo",  count:alertData.filter(a => a.type==="bank").length },
    { id:"idle",      label:"Idle",       count:alertData.filter(a => a.type==="idle").length },
    { id:"survey",    label:"Survey",     count:alertData.filter(a => a.type==="survey").length },
  ];

  const filtered = filter === "all" ? alertData : alertData.filter(a => a.type === filter);

  const markRead = (id: number) =>
    setAlertData(prev => prev.map(a => a.id===id ? {...a, read:true} : a));

  return (
    <div style={{ fontFamily:"Inter, sans-serif", display:"flex", height:"100%" }}>

      {/* SIDEBAR */}
      <aside style={{ width:220, background:"#fff", borderRight:"1px solid #EAECF0", padding:20, flexShrink:0, overflowY:"auto" }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:16 }}>Alert types</div>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            display:"flex", justifyContent:"space-between", alignItems:"center",
            width:"100%", textAlign:"left" as const,
            background: filter===f.id ? "#ECFDF3" : "none",
            border: filter===f.id ? "1px solid #A9EFC5" : "1px solid transparent",
            borderRadius:7, padding:"7px 10px", marginBottom:4,
            color: filter===f.id ? "#1D9E75" : "#667085",
            fontSize:12, cursor:"pointer", fontFamily:"Inter, sans-serif",
          }}>
            <span>{f.id!=="all" && typeConfig[f.id]?.icon+" "}{f.label}</span>
            <span style={{ fontSize:11, fontWeight:600, padding:"1px 6px", borderRadius:8, background:"#F9FAFB", color:"#667085", border:"1px solid #EAECF0" }}>{f.count}</span>
          </button>
        ))}

        <div style={{ borderTop:"1px solid #EAECF0", paddingTop:16, marginTop:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:12 }}>Summary</div>
          {[
            ["Unread",    unread,                                                     "#F04438"],
            ["Critical",  alertData.filter(a => a.priority==="critical").length,      "#F04438"],
            ["High",      alertData.filter(a => a.priority==="high").length,          "#DC6803"],
            ["Auctions",  alertData.filter(a => a.type==="judicial").length,          "#7C3AED"],
          ].map(([l, v, c]) => (
            <div key={String(l)} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:12, color:"#667085" }}>{l}</span>
              <span style={{ fontSize:12, fontWeight:700, color:String(c) }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex:1, overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:"#101828" }}>{filtered.length} alerts · {unread} unread</div>
            <div style={{ fontSize:12, color:"#98A2B3", marginTop:2 }}>Live monitoring active</div>
          </div>
          <button
            onClick={() => setAlertData(prev => prev.map(a => ({...a, read:true})))}
            style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:8, padding:"7px 14px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            Mark all read
          </button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(a => {
            const tc = typeConfig[a.type];
            return (
              <div key={a.id}
                onClick={() => { setSel(a.id===sel ? null : a.id); markRead(a.id); }}
                style={{
                  background: "#fff",
                  border: `1px solid ${sel===a.id ? "#101828" : "#EAECF0"}`,
                  borderLeft: `3px solid ${priorityColor[a.priority]}`,
                  borderRadius: "0 10px 10px 0",
                  padding:"14px 18px", cursor:"pointer", transition:"all 0.15s",
                  display:"grid", gridTemplateColumns:"auto 1fr auto", gap:16, alignItems:"center",
                  opacity: a.read ? 1 : 1,
                  boxShadow: a.read ? "0 1px 2px rgba(16,24,40,0.04)" : "0 2px 6px rgba(16,24,40,0.06)",
                }}>

                <div style={{ width:40, height:40, borderRadius:10, background:tc.bg, border:`1px solid ${tc.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {tc.icon}
                </div>

                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                    {!a.read && <div style={{ width:7, height:7, borderRadius:"50%", background:"#F04438", flexShrink:0 }} />}
                    <span style={{ fontSize:14, fontWeight:700, color:"#101828" }}>{a.title}</span>
                    <span style={{ fontSize:10, fontWeight:600, padding:"1px 7px", borderRadius:8, background:tc.bg, color:tc.color, border:`1px solid ${tc.border}` }}>{tc.label}</span>
                    <span style={{ fontSize:10, fontWeight:600, padding:"1px 7px", borderRadius:8, background:"#F9FAFB", color:priorityColor[a.priority], border:"1px solid #EAECF0", textTransform:"uppercase" as const }}>{a.priority}</span>
                  </div>
                  <div style={{ fontSize:12, color:"#667085", marginBottom:5, lineHeight:1.5 }}>{a.description.slice(0,120)}...</div>
                  <div style={{ display:"flex", gap:16, fontSize:11, color:"#98A2B3" }}>
                    <span>{a.flag} {a.vessel}</span>
                    <span>·</span>
                    <span>{a.ldt.toLocaleString()} LDT</span>
                    <span>·</span>
                    <span style={{ color:"#1D9E75", fontWeight:600 }}>${(a.value/1000000).toFixed(1)}M est. value</span>
                    {a.daysLeft && <><span>·</span><span style={{ color:"#F04438", fontWeight:600 }}>⏱ {a.daysLeft}d left</span></>}
                  </div>
                </div>

                <div style={{ textAlign:"right" as const, flexShrink:0 }}>
                  <div style={{ fontSize:11, color:"#98A2B3", marginBottom:6 }}>{a.time}</div>
                  {a.deadline && (
                    <div style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:6, background:"#FEF3F2", color:"#F04438", border:"1px solid #FECDCA", whiteSpace:"nowrap" as const }}>
                      Due {a.deadline}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* DETAIL */}
      {selA && (
        <aside style={{ width:300, background:"#fff", borderLeft:"1px solid #EAECF0", padding:20, overflowY:"auto", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em" }}>Alert Detail</div>
            <button onClick={() => setSel(null)} style={{ background:"none", border:"none", color:"#98A2B3", cursor:"pointer", fontSize:20 }}>×</button>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:typeConfig[selA.type].bg, border:`1px solid ${typeConfig[selA.type].border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
              {typeConfig[selA.type].icon}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:typeConfig[selA.type].color, textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{typeConfig[selA.type].label}</div>
              <div style={{ fontSize:12, color:"#667085", marginTop:1 }}>{selA.priority} priority</div>
            </div>
          </div>

          <div style={{ fontSize:15, fontWeight:700, color:"#101828", marginBottom:2 }}>{selA.vessel}</div>
          <div style={{ fontSize:12, color:"#667085", marginBottom:14 }}>{selA.vesselType} · {selA.flag} · {selA.imo}</div>

          <div style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:10, padding:14, marginBottom:12, textAlign:"center" as const }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:4 }}>Estimated scrap value</div>
            <div style={{ fontSize:26, fontWeight:800, color:"#1D9E75", letterSpacing:-1 }}>${(selA.value/1000000).toFixed(2)}M</div>
            <div style={{ fontSize:11, color:"#667085", marginTop:2 }}>{selA.ldt.toLocaleString()} LDT · {selA.market}</div>
            {selA.reservePrice && (
              <div style={{ marginTop:8, fontSize:12, color:"#DC6803", fontWeight:600 }}>Reserve: ${(selA.reservePrice/1000000).toFixed(1)}M</div>
            )}
          </div>

          <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:14, marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>Details</div>
            <div style={{ fontSize:12, color:"#667085", lineHeight:1.6 }}>{selA.description}</div>
          </div>

          <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:14, marginBottom:12 }}>
            {[
              ["Location",   selA.location],
              selA.court      ? ["Court",      selA.court]      : null,
              selA.deadline   ? ["Deadline",   selA.deadline]   : null,
              selA.inspection ? ["Inspection", selA.inspection] : null,
              ["Age",        selA.age+" years"],
              ["LDT",        selA.ldt.toLocaleString()],
            ].filter(Boolean).map(item => {
              const [l, v] = item as [string, string];
              return (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", marginBottom:8, gap:8 }}>
                  <span style={{ fontSize:11, color:"#667085", flexShrink:0 }}>{l}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:"#101828", textAlign:"right" as const }}>{v}</span>
                </div>
              );
            })}
          </div>

          {selA.daysLeft && (
            <div style={{ background:"#FEF3F2", border:"1px solid #FECDCA", borderRadius:10, padding:12, marginBottom:12, textAlign:"center" as const }}>
              <div style={{ fontSize:11, color:"#667085", marginBottom:4 }}>Bid deadline</div>
              <div style={{ fontSize:22, fontWeight:800, color:"#F04438", letterSpacing:-0.5 }}>{selA.daysLeft} days</div>
              <div style={{ fontSize:11, color:"#667085", marginTop:2 }}>{selA.deadline}</div>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button style={{ background:"#101828", border:"none", borderRadius:10, padding:"10px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Contact / Submit bid →
            </button>
            <button style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:10, padding:"10px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Add to CRM
            </button>
            <button style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:"10px", color:"#667085", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Set reminder
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
