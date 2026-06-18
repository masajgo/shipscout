"use client";
import { useState, useEffect } from "react";

const columns = [
  { id:"lead",        label:"New Lead",        color:"#667085" },
  { id:"contacted",   label:"Contacted",       color:"#2563EB" },
  { id:"negotiating", label:"Negotiating",     color:"#DC6803" },
  { id:"offer",       label:"Offer Sent",      color:"#7C3AED" },
  { id:"closed",      label:"Closed",          color:"#1D9E75" },
];

const statusColor: Record<string, string> = {
  contacted:"#667085", reply:"#2563EB", negotiating:"#DC6803", offer:"#7C3AED", closed:"#1D9E75",
};

const scoreColor = (s: number) => s >= 90 ? "#F04438" : s >= 80 ? "#DC6803" : "#2563EB";

function DealCard({ d, sel, onSelect, onDragStart, onDragEnd }: {
  d: any; sel: string | null;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(d.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(d.id)}
      style={{
        background: sel === d.id ? "#F9FAFB" : "#fff",
        border: sel === d.id ? "1px solid #101828" : "1px solid #EAECF0",
        borderRadius:10, padding:12, marginBottom:8, cursor:"pointer",
        transition:"all 0.15s", boxShadow:"0 1px 2px rgba(16,24,40,0.04)",
      }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#101828", lineHeight:1.3, flex:1, marginRight:8 }}>
          {d.flag} {d.vessel}
        </div>
        <div style={{ fontSize:11, fontWeight:700, color:"#1D9E75", whiteSpace:"nowrap" }}>
          ${(d.value/1000000).toFixed(1)}M
        </div>
      </div>
      <div style={{ fontSize:11, color:"#667085", marginBottom:4 }}>{d.type} · {d.ldt.toLocaleString()} LDT</div>
      <div style={{ fontSize:11, color:"#667085", marginBottom:8 }}>{d.owner}</div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:10, color:"#98A2B3", fontFamily:"monospace" }}>{d.lastActivity}</div>
        <div style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
          background: d.score>=90 ? "#FEF3F2" : d.score>=80 ? "#FFFAEB" : "#EFF8FF",
          color: scoreColor(d.score), fontFamily:"monospace" }}>
          {d.score}
        </div>
      </div>
    </div>
  );
}

export default function CRM() {
  const [sel, setSel]           = useState<string|null>(null);
  const [drag, setDrag]         = useState<string|null>(null);
  const [dealData, setDealData] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<"kanban"|"list">("kanban");
  const [escrowDone, setEscrowDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/add").then(r => r.json()),
      fetch("/api/vessels").then(r => r.json()),
    ]).then(([crm, vess]) => {
      const vesselMap = Object.fromEntries((vess.vessels || []).map((v: any) => [v.imo, v]));
      const enriched = (crm.vessels || []).map((c: any) => {
        const v = vesselMap[c.imo] || {};
        const ldt = v.ldt || 0;
        const price = v.market === "Chittagong" ? 541 : v.market === "Alang" ? 501 : v.market === "Aliağa" ? 332 : 511;
        return {
          id:           c.imo,
          vessel:       c.name || `IMO ${c.imo}`,
          type:         v.type  || "—",
          flag:         v.flag  || "—",
          ldt,
          value:        ldt * price,
          owner:        "—",
          email:        "—",
          status:       c.stage || "lead",
          score:        c.score || v.score || 0,
          contacted:    c.addedAt ? new Date(c.addedAt).toLocaleDateString("en", { month:"short", day:"numeric" }) : "—",
          lastActivity: c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en", { month:"short", day:"numeric" }) : "—",
          market:       v.market || "—",
          imo:          c.imo,
        };
      });
      setDealData(enriched);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selD = dealData.find(d => d.id === sel);
  const totalValue  = dealData.filter(d => d.status !== "closed").reduce((a, d) => a + (d.value || 0), 0);
  const closedValue = dealData.filter(d => d.status === "closed").reduce((a, d) => a + (d.value || 0), 0);

  const moveCard = (dealId: string, newStatus: string) => {
    setDealData(prev => prev.map(d => d.id === dealId ? {...d, status: newStatus} : d));
    fetch("/api/crm/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imo: dealId, stage: newStatus }),
    }).catch(() => {});
  };

  return (
    <div style={{ fontFamily:"Inter, sans-serif", background:"#F9FAFB", color:"#101828", display:"flex", flexDirection:"column", height:"calc(100vh - 94px)" }}>

      {/* TOOLBAR */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EAECF0", padding:"12px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <div style={{ width:20, height:1.5, background:"#1D9E75" }} />
            <span style={{ fontSize:11, fontWeight:600, color:"#1D9E75", letterSpacing:"0.12em", textTransform:"uppercase" as const }}>Deal CRM</span>
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:"#101828" }}>
            {loading ? "Loading..." : `${dealData.filter(d => d.status !== "closed").length} active deals · $${(totalValue/1000000).toFixed(1)}M pipeline`}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={() => setView("kanban")} style={{
            background: view==="kanban" ? "#101828" : "#fff",
            border: view==="kanban" ? "1px solid #101828" : "1px solid #EAECF0",
            borderRadius:6, padding:"5px 12px", color: view==="kanban" ? "#fff" : "#667085",
            fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"Inter, sans-serif",
          }}>Kanban</button>
          <button onClick={() => setView("list")} style={{
            background: view==="list" ? "#101828" : "#fff",
            border: view==="list" ? "1px solid #101828" : "1px solid #EAECF0",
            borderRadius:6, padding:"5px 12px", color: view==="list" ? "#fff" : "#667085",
            fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"Inter, sans-serif",
          }}>List</button>
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <main style={{ flex:1, overflowY:"auto", padding:24 }}>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:24 }}>
            {[
              ["Pipeline",    "$"+Math.round(totalValue/1000000*10)/10+"M",  "#1D9E75"],
              ["Closed",      "$"+Math.round(closedValue/1000000*10)/10+"M", "#1D9E75"],
              ["Active",      dealData.filter(d => d.status!=="closed").length, "#2563EB"],
              ["In Progress", dealData.filter(d => ["contacted","negotiating","offer"].includes(d.status)).length, "#DC6803"],
              ["Won",         dealData.filter(d => d.status==="closed").length, "#7C3AED"],
            ].map(([l, v, c], i) => (
              <div key={i} style={{ background:"#fff", border:"1px solid #EAECF0", borderRadius:10, padding:"12px 16px", boxShadow:"0 1px 2px rgba(16,24,40,0.04)" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>{l}</div>
                <div style={{ fontSize:22, fontWeight:800, color:String(c), letterSpacing:-0.5 }}>{String(v)}</div>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ textAlign:"center", padding:"48px", color:"#98A2B3", fontSize:13 }}>Loading deals from CRM...</div>
          )}
          {!loading && dealData.length === 0 && (
            <div style={{ textAlign:"center", padding:"64px 20px", color:"#98A2B3" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:600, color:"#344054", marginBottom:6 }}>No deals yet</div>
              <div style={{ fontSize:13 }}>Add vessels from the Vessels page using the &quot;Add to CRM&quot; button.</div>
            </div>
          )}
          {/* KANBAN */}
          {!loading && view === "kanban" && dealData.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, alignItems:"start" }}>
              {columns.map(col => (
                <div key={col.id}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (drag) { moveCard(drag, col.id); setDrag(null); } }}
                  style={{ background:"#fff", border:"1px solid #EAECF0", borderRadius:12, padding:12, minHeight:200 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:col.color, textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{col.label}</div>
                    <div style={{ fontSize:11, fontWeight:600, padding:"1px 7px", borderRadius:10, background:"#F9FAFB", color:"#667085", border:"1px solid #EAECF0" }}>
                      {dealData.filter(d => d.status === col.id).length}
                    </div>
                  </div>
                  {dealData.filter(d => d.status === col.id).map(d => (
                    <DealCard key={d.id} d={d} sel={sel}
                      onSelect={id => setSel(id === sel ? null : id)}
                      onDragStart={id => setDrag(id)}
                      onDragEnd={() => setDrag(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* LIST VIEW */}
          {!loading && view === "list" && dealData.length > 0 && (
            <div style={{ background:"#fff", border:"1px solid #EAECF0", borderRadius:14, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #EAECF0" }}>
                    {["Vessel","Owner","LDT","Value","Market","Status","Last activity"].map(h => (
                      <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dealData.map((d, i) => (
                    <tr key={d.id} onClick={() => setSel(d.id===sel ? null : d.id)} style={{
                      borderBottom: i<dealData.length-1 ? "1px solid #EAECF0" : "none",
                      background: sel===d.id ? "#F9FAFB" : "#fff",
                      cursor:"pointer",
                    }}>
                      <td style={{ padding:"11px 16px" }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#101828" }}>{d.flag} {d.vessel}</div>
                        <div style={{ fontSize:11, color:"#667085" }}>{d.type}</div>
                      </td>
                      <td style={{ padding:"11px 16px", fontSize:12, color:"#344054" }}>{d.owner}</td>
                      <td style={{ padding:"11px 16px", fontSize:12, color:"#344054" }}>{d.ldt.toLocaleString()}</td>
                      <td style={{ padding:"11px 16px", fontSize:13, fontWeight:700, color:"#1D9E75" }}>${(d.value/1000000).toFixed(1)}M</td>
                      <td style={{ padding:"11px 16px", fontSize:12, color:"#344054" }}>{d.market}</td>
                      <td style={{ padding:"11px 16px" }}>
                        <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:6, background:"#F9FAFB", color:statusColor[d.status], border:"1px solid #EAECF0" }}>{d.status}</span>
                      </td>
                      <td style={{ padding:"11px 16px", fontSize:11, color:"#98A2B3" }}>{d.lastActivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* DETAIL */}
        {selD && (
          <aside style={{ width:280, background:"#fff", borderLeft:"1px solid #EAECF0", padding:20, overflowY:"auto", flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em" }}>Deal Detail</div>
              <button onClick={() => setSel(null)} style={{ background:"none", border:"none", color:"#98A2B3", cursor:"pointer", fontSize:20 }}>×</button>
            </div>

            <div style={{ fontSize:15, fontWeight:700, color:"#101828", marginBottom:2 }}>{selD.flag} {selD.vessel}</div>
            <div style={{ fontSize:12, color:"#667085", marginBottom:16 }}>{selD.type} · {selD.ldt.toLocaleString()} LDT</div>

            <div style={{ background:"#ECFDF3", border:"1px solid #A9EFC5", borderRadius:10, padding:14, marginBottom:12, textAlign:"center" as const }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:4 }}>Deal value</div>
              <div style={{ fontSize:28, fontWeight:800, color:"#1D9E75", letterSpacing:-1 }}>${(selD.value/1000000).toFixed(2)}M</div>
              <div style={{ fontSize:11, color:"#667085", marginTop:2 }}>{selD.ldt.toLocaleString()} LDT · {selD.market}</div>
            </div>

            <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:14, marginBottom:12 }}>
              {[["Owner",selD.owner],["Email",selD.email],["Contacted",selD.contacted],["Last activity",selD.lastActivity],["Status",selD.status],["Scrap score",selD.score+"/100"]].map(([l, v]) => (
                <div key={String(l)} style={{ display:"flex", justifyContent:"space-between", marginBottom:8, gap:8 }}>
                  <span style={{ fontSize:11, color:"#667085", flexShrink:0 }}>{l}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:"#101828", textAlign:"right" as const }}>{String(v)}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#98A2B3", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>Move to stage</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {columns.map(col => (
                  <button key={col.id} onClick={() => moveCard(selD.id, col.id)} style={{
                    background: selD.status===col.id ? "#ECFDF3" : "#F9FAFB",
                    border: selD.status===col.id ? "1px solid #A9EFC5" : "1px solid #EAECF0",
                    borderRadius:7, padding:"7px 12px",
                    color: selD.status===col.id ? "#1D9E75" : col.color,
                    fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"Inter, sans-serif", textAlign:"left" as const,
                  }}>
                    {selD.status===col.id ? "✓ " : ""}{col.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button
                onClick={() => window.location.href = `mailto:${selD.email !== "—" ? selD.email : ""}?subject=Follow-up%20%E2%80%94%20${encodeURIComponent(selD.vessel)}&body=Dear%20Owner%2C%0A%0AWe%20are%20following%20up%20on%20the%20acquisition%20of%20${encodeURIComponent(selD.vessel)}.%0A%0APlease%20let%20us%20know%20your%20availability%20for%20further%20discussion.%0A%0ABest%20regards`}
                style={{ background:"#101828", border:"none", borderRadius:10, padding:"10px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>Send follow-up →</button>
              <button
                onClick={() => { setEscrowDone(p => ({...p, [selD.id]: true})); setTimeout(() => setEscrowDone(p => ({...p, [selD.id]: false})), 3000); }}
                style={{ background: escrowDone[selD.id] ? "#101828" : "#ECFDF3", border: escrowDone[selD.id] ? "1px solid #101828" : "1px solid #A9EFC5", borderRadius:10, padding:"10px", color: escrowDone[selD.id] ? "#fff" : "#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                {escrowDone[selD.id] ? "✓ Escrow initiated" : "Open escrow"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
