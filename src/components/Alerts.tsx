"use client";
import { useState, useEffect } from "react";

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
  const [sel, setSel]             = useState<number|null>(null);
  const [filter, setFilter]       = useState("all");
  const [alertData, setAlertData] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [crmAdded, setCrmAdded]   = useState<Record<number, boolean>>({});
  const [reminder, setReminder]   = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/alerts")
      .then(r => r.json())
      .then(d => { setAlertData(d.alerts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const selA   = alertData.find(a => a.id === sel);
  const unread = alertData.filter(a => !a.read).length;

  const filters = [
    { id:"all",        label:"All alerts", count:alertData.length },
    { id:"judicial",   label:"Judicial",   count:alertData.filter(a => a.type==="judicial").length },
    { id:"dark",       label:"AIS Dark",   count:alertData.filter(a => a.type==="dark").length },
    { id:"bank",       label:"Bank Repo",  count:alertData.filter(a => a.type==="bank").length },
    { id:"sanctions",  label:"Sanctions",  count:alertData.filter(a => a.type==="sanctions").length },
    { id:"idle",       label:"Idle",       count:alertData.filter(a => a.type==="idle").length },
    { id:"survey",     label:"Survey",     count:alertData.filter(a => a.type==="survey").length },
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
          <button key={f.id} onClick={() => { setFilter(f.id); setSel(null); }} style={{
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
          {loading && (
            <div style={{ textAlign:"center", padding:"48px", color:"#98A2B3", fontSize:13 }}>
              Loading live vessel data...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"48px 20px", color:"#98A2B3" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📭</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#344054", marginBottom:6 }}>No alerts in this category</div>
              <button onClick={() => setFilter("all")} style={{ fontSize:12, fontWeight:600, color:"#1D9E75", border:"1px solid #A9EFC5", background:"#ECFDF3", padding:"7px 16px", borderRadius:7, cursor:"pointer" }}>
                Show all alerts
              </button>
            </div>
          )}
          {filtered.map(a => {
            const tc = typeConfig[a.type] ?? typeConfig.idle;
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
                    <span>{(a.ldt || 0).toLocaleString()} LDT</span>
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
      {selA && (() => {
        const stc = typeConfig[selA.type] ?? typeConfig.idle;
        return (
        <aside style={{ width:300, background:"#fff", borderLeft:"1px solid #EAECF0", padding:20, overflowY:"auto", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em" }}>Alert Detail</div>
            <button onClick={() => setSel(null)} style={{ background:"none", border:"none", color:"#98A2B3", cursor:"pointer", fontSize:20 }}>×</button>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:stc.bg, border:`1px solid ${stc.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
              {stc.icon}
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:stc.color, textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{stc.label}</div>
              <div style={{ fontSize:12, color:"#667085", marginTop:1 }}>{selA.priority} priority</div>
            </div>
          </div>

          <div style={{ fontSize:15, fontWeight:700, color:"#101828", marginBottom:2 }}>{selA.vessel}</div>
          <div style={{ fontSize:12, color:"#667085", marginBottom:14 }}>{selA.vesselType} · {selA.flag} · {selA.imo}</div>

          <div style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:10, padding:14, marginBottom:12, textAlign:"center" as const }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:4 }}>Estimated scrap value</div>
            <div style={{ fontSize:26, fontWeight:800, color:"#1D9E75", letterSpacing:-1 }}>${(selA.value/1000000).toFixed(2)}M</div>
            <div style={{ fontSize:11, color:"#667085", marginTop:2 }}>{(selA.ldt || 0).toLocaleString()} LDT · {selA.market}</div>
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
            <button
              onClick={() => window.location.href = `mailto:ardavcioglu@gmail.com?subject=Bid%20Inquiry%20%E2%80%94%20${encodeURIComponent(selA.vessel)}&body=IMO%3A%20${selA.imo}%0AEstimated%20value%3A%20%24${(selA.value/1000000).toFixed(2)}M`}
              style={{ background:"#101828", border:"none", borderRadius:10, padding:"10px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Contact / Submit bid →
            </button>
            <button
              onClick={async () => {
                await fetch("/api/crm/add", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ imo: selA.imo, name: selA.vessel, score: selA.score || 80, stage: "lead" }) }).catch(()=>{});
                setCrmAdded(p => ({...p, [selA.id]: true}));
              }}
              style={{ background: crmAdded[selA.id] ? "#ECFDF3" : "#ECFDF3", border: crmAdded[selA.id] ? "1px solid #1D9E75" : "1px solid #A9EFC5", borderRadius:10, padding:"10px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {crmAdded[selA.id] ? "✓ Added to CRM" : "Add to CRM"}
            </button>
            <button
              onClick={() => { setReminder(p => ({...p, [selA.id]: true})); setTimeout(() => setReminder(p => ({...p, [selA.id]: false})), 3000); }}
              style={{ background: reminder[selA.id] ? "#ECFDF3" : "#F9FAFB", border: reminder[selA.id] ? "1px solid #A9EFC5" : "1px solid #EAECF0", borderRadius:10, padding:"10px", color: reminder[selA.id] ? "#1D9E75" : "#667085", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {reminder[selA.id] ? "✓ Reminder set" : "Set reminder"}
            </button>
          </div>
        </aside>
        );
      })()}
    </div>
  );
}
