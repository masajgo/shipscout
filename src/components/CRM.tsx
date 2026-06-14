"use client";
import { useState } from "react";

const columns = [
  { id:"contacted", label:"Contacted", color:"#8FA8B2", count:8 },
  { id:"reply", label:"Reply Received", color:"#6CB8E6", count:5 },
  { id:"negotiating", label:"Negotiating", color:"#FB923C", count:3 },
  { id:"offer", label:"Offer Sent", color:"#A78BFA", count:2 },
  { id:"closed", label:"Closed", color:"#4ADE80", count:4 },
];

const deals = [
  { id:1, vessel:"MV PACIFIC TRADER", type:"Bulk Carrier", flag:"🇬🇷", ldt:8420, value:2778600, owner:"Danaos Shipping", email:"fleet@danaos.gr", status:"negotiating", score:87, contacted:"Jun 10", lastActivity:"2h ago", market:"Aliağa" },
  { id:2, vessel:"MV CORAL STAR", type:"General Cargo", flag:"🇯🇵", ldt:5180, value:2797800, owner:"Pacific Lines", email:"ops@pacificlines.jp", status:"reply", score:91, contacted:"Jun 8", lastActivity:"1d ago", market:"Alang" },
  { id:3, vessel:"MV NORSE VIKING", type:"Oil Tanker", flag:"🇳🇴", ldt:12740, value:4204200, owner:"Bergesen Maritime", email:"chartering@bergesen.no", status:"contacted", score:83, contacted:"Jun 12", lastActivity:"3h ago", market:"Chittagong" },
  { id:4, vessel:"MV EASTERN SUN", type:"Bulk Carrier", flag:"🇨🇳", ldt:9310, value:5027400, owner:"Sinoship Group", email:"fleet@sinoship.cn", status:"offer", score:94, contacted:"Jun 5", lastActivity:"4h ago", market:"Alang" },
  { id:5, vessel:"MV ATLAS GLORY", type:"Container Ship", flag:"🇩🇪", ldt:6890, value:2272700, owner:"Hapag Trading", email:"ops@hapagtrading.de", status:"contacted", score:79, contacted:"Jun 13", lastActivity:"30m ago", market:"Gadani" },
  { id:6, vessel:"MV ADRIATIC HOPE", type:"General Cargo", flag:"🇬🇷", ldt:4250, value:1402500, owner:"Aegean Maritime", email:"ops@aegean.gr", status:"closed", score:71, contacted:"May 28", lastActivity:"Closed Jun 10", market:"Aliağa" },
  { id:7, vessel:"MV SOUTHERN CROSS", type:"Bulk Carrier", flag:"🇦🇺", ldt:11200, value:5712000, owner:"Pacific Bulk Ltd", email:"ops@pacbulk.au", status:"negotiating", score:88, contacted:"Jun 7", lastActivity:"5h ago", market:"Alang" },
  { id:8, vessel:"MV BLACK SEA", type:"Oil Tanker", flag:"🇷🇺", ldt:7800, value:4212000, owner:"Sovcomflot", email:"fleet@scf.ru", status:"reply", score:82, contacted:"Jun 9", lastActivity:"8h ago", market:"Aliağa" },
  { id:9, vessel:"MV EUROPA", type:"Container Ship", flag:"🇩🇪", ldt:5600, value:3024000, owner:"Hamburg Sud", email:"ops@hamburgsud.de", status:"closed", score:76, contacted:"May 20", lastActivity:"Closed Jun 1", market:"Aliağa" },
  { id:10, vessel:"MV TIGER BAY", type:"Bulk Carrier", flag:"🇸🇬", ldt:9800, value:5292000, owner:"Pacific Int.", email:"fleet@pacint.sg", status:"contacted", score:85, contacted:"Jun 13", lastActivity:"1h ago", market:"Alang" },
];

const statusColor: Record<string, string> = {
  contacted:"#8FA8B2", reply:"#6CB8E6", negotiating:"#FB923C", offer:"#A78BFA", closed:"#4ADE80"
};

export default function CRM() {
  const [sel, setSel] = useState<number|null>(null);
  const [drag, setDrag] = useState<number|null>(null);
  const [dealData, setDealData] = useState(deals);
  const [view, setView] = useState<"kanban"|"list">("kanban");

  const selD = dealData.find(d => d.id === sel);
  const totalValue = dealData.filter(d=>d.status!=="closed").reduce((a,d)=>a+d.value,0);
  const closedValue = dealData.filter(d=>d.status==="closed").reduce((a,d)=>a+d.value,0);

  const moveCard = (dealId: number, newStatus: string) => {
    setDealData(prev => prev.map(d => d.id===dealId ? {...d, status:newStatus} : d));
  };

  const DealCard = ({ d }: { d: typeof deals[0] }) => (
    <div
      draggable
      onDragStart={() => setDrag(d.id)}
      onClick={() => setSel(d.id === sel ? null : d.id)}
      style={{
        background: sel===d.id ? "#1A3A4A" : "#0D1F28",
        border: sel===d.id ? "1px solid rgba(29,158,117,0.4)" : "1px solid rgba(143,168,178,0.12)",
        borderRadius:10, padding:12, marginBottom:8, cursor:"pointer",
        transition:"all 0.15s"
      }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8}}>
        <div style={{fontSize:12, fontWeight:700, color:"#E8F0F3", lineHeight:1.3, flex:1, marginRight:8}}>
          {d.flag} {d.vessel}
        </div>
        <div style={{fontSize:11, fontWeight:700, color:"#1D9E75", whiteSpace:"nowrap"}}>
          ${(d.value/1000000).toFixed(1)}M
        </div>
      </div>
      <div style={{fontSize:11, color:"#8FA8B2", marginBottom:6}}>{d.type} · {d.ldt.toLocaleString()} LDT</div>
      <div style={{fontSize:11, color:"#8FA8B2", marginBottom:8}}>{d.owner}</div>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div style={{fontSize:10, color:"rgba(143,168,178,0.6)", fontFamily:"monospace"}}>{d.lastActivity}</div>
        <div style={{fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:4,
          background: d.score>=90?"rgba(248,113,113,0.12)":d.score>=80?"rgba(251,146,60,0.12)":"rgba(250,204,21,0.12)",
          color: d.score>=90?"#F87171":d.score>=80?"#FB923C":"#FACC15",
          fontFamily:"monospace"}}>
          {d.score}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"Inter, sans-serif", minHeight:"100vh", background:"#0D1F28", color:"#E8F0F3"}}>

      {/* NAV */}
      <nav style={{background:"#0D1F28", borderBottom:"1px solid rgba(143,168,178,0.15)", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:50}}>
        <div style={{display:"flex", alignItems:"center", gap:32}}>
          <div style={{fontFamily:"Space Grotesk, sans-serif", fontWeight:700, fontSize:18, letterSpacing:-0.5}}>
            <span style={{color:"#E8F0F3"}}>Ship</span><span style={{color:"#1D9E75"}}>Scout</span>
          </div>
          {[["Vessels","/"],["Markets","/markets"],["Deal CRM","/crm"],["Alerts","/alerts"]].map(([t,h])=>(
            <a key={t} href={h} style={{color: t==="Deal CRM"?"#1D9E75":"#8FA8B2", fontSize:13, fontWeight:500, textDecoration:"none", borderBottom: t==="Deal CRM"?"2px solid #1D9E75":"2px solid transparent", paddingBottom:2}}>{t}</a>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <button onClick={()=>setView("kanban")} style={{background: view==="kanban"?"rgba(29,158,117,0.15)":"none", border: view==="kanban"?"1px solid rgba(29,158,117,0.3)":"1px solid rgba(143,168,178,0.15)", borderRadius:6, padding:"4px 10px", color: view==="kanban"?"#1D9E75":"#8FA8B2", fontSize:12, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>Kanban</button>
          <button onClick={()=>setView("list")} style={{background: view==="list"?"rgba(29,158,117,0.15)":"none", border: view==="list"?"1px solid rgba(29,158,117,0.3)":"1px solid rgba(143,168,178,0.15)", borderRadius:6, padding:"4px 10px", color: view==="list"?"#1D9E75":"#8FA8B2", fontSize:12, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>List</button>
          <div style={{width:32, height:32, borderRadius:"50%", background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600, color:"#1D9E75"}}>T</div>
        </div>
      </nav>

      <div style={{display:"flex", height:"calc(100vh - 56px)"}}>
        <main style={{flex:1, overflowY:"auto", padding:24}}>

          {/* Stats */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10, marginBottom:24}}>
            {[
              ["Pipeline value","$"+Math.round(totalValue/1000000*10)/10+"M","#1D9E75"],
              ["Closed value","$"+Math.round(closedValue/1000000*10)/10+"M","#4ADE80"],
              ["Active deals",dealData.filter(d=>d.status!=="closed").length,"#6CB8E6"],
              ["Replies",dealData.filter(d=>d.status==="reply"||d.status==="negotiating"||d.status==="offer").length,"#FB923C"],
              ["Closed",dealData.filter(d=>d.status==="closed").length,"#A78BFA"],
            ].map(([l,v,c])=>(
              <div key={String(l)} style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.12)", borderRadius:10, padding:"12px 16px"}}>
                <div style={{fontSize:10, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6}}>{l}</div>
                <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:22, fontWeight:700, color:String(c)}}>{String(v)}</div>
              </div>
            ))}
          </div>

          {/* KANBAN */}
          {view === "kanban" && (
            <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, alignItems:"start"}}>
              {columns.map(col => (
                <div key={col.id}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{ if(drag) { moveCard(drag, col.id); setDrag(null); }}}
                  style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.12)", borderRadius:12, padding:12, minHeight:200}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                    <div style={{fontSize:11, fontWeight:600, color:col.color, textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:"monospace"}}>{col.label}</div>
                    <div style={{fontSize:11, fontWeight:600, padding:"1px 7px", borderRadius:10, background:"rgba(143,168,178,0.1)", color:"#8FA8B2"}}>{dealData.filter(d=>d.status===col.id).length}</div>
                  </div>
                  {dealData.filter(d=>d.status===col.id).map(d=><DealCard key={d.id} d={d} />)}
                </div>
              ))}
            </div>
          )}

          {/* LIST VIEW */}
          {view === "list" && (
            <div style={{background:"#0F2733", border:"1px solid rgba(143,168,178,0.12)", borderRadius:14, overflow:"hidden"}}>
              <table style={{width:"100%", borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(143,168,178,0.12)"}}>
                    {["Vessel","Owner","LDT","Value","Market","Status","Last activity"].map(h=>(
                      <th key={h} style={{padding:"10px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.06em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dealData.map((d,i)=>(
                    <tr key={d.id} onClick={()=>setSel(d.id===sel?null:d.id)} style={{borderBottom: i<dealData.length-1?"1px solid rgba(143,168,178,0.08)":"none", background: sel===d.id?"rgba(29,158,117,0.06)":"none", cursor:"pointer"}}>
                      <td style={{padding:"11px 16px"}}>
                        <div style={{fontSize:13, fontWeight:600, color:"#E8F0F3"}}>{d.flag} {d.vessel}</div>
                        <div style={{fontSize:11, color:"#8FA8B2"}}>{d.type}</div>
                      </td>
                      <td style={{padding:"11px 16px", fontSize:12, color:"#E8F0F3"}}>{d.owner}</td>
                      <td style={{padding:"11px 16px", fontSize:12, color:"#E8F0F3"}}>{d.ldt.toLocaleString()}</td>
                      <td style={{padding:"11px 16px", fontSize:13, fontWeight:600, color:"#1D9E75"}}>${(d.value/1000000).toFixed(1)}M</td>
                      <td style={{padding:"11px 16px", fontSize:12, color:"#E8F0F3"}}>{d.market}</td>
                      <td style={{padding:"11px 16px"}}>
                        <span style={{fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:6, fontFamily:"monospace", background:"rgba(143,168,178,0.08)", color:statusColor[d.status]}}>{d.status}</span>
                      </td>
                      <td style={{padding:"11px 16px", fontSize:11, color:"#8FA8B2"}}>{d.lastActivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* DETAIL */}
        {selD && (
          <aside style={{width:280, background:"#0F2733", borderLeft:"1px solid rgba(143,168,178,0.12)", padding:20, overflowY:"auto", flexShrink:0}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Deal Detail</div>
              <button onClick={()=>setSel(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:20}}>×</button>
            </div>

            <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700, color:"#E8F0F3", marginBottom:3}}>{selD.flag} {selD.vessel}</div>
            <div style={{fontSize:12, color:"#8FA8B2", marginBottom:16}}>{selD.type} · {selD.ldt.toLocaleString()} LDT</div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:14, marginBottom:12, textAlign:"center"}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4}}>Deal value</div>
              <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:28, fontWeight:700, color:"#1D9E75"}}>${(selD.value/1000000).toFixed(2)}M</div>
              <div style={{fontSize:11, color:"#8FA8B2", marginTop:2}}>{selD.ldt.toLocaleString()} LDT · {selD.market}</div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              {[["Owner",selD.owner],["Email",selD.email],["Contacted",selD.contacted],["Last activity",selD.lastActivity],["Status",selD.status],["Scrap score",selD.score+"/100"]].map(([l,v])=>(
                <div key={String(l)} style={{display:"flex", justifyContent:"space-between", marginBottom:8, gap:8}}>
                  <span style={{fontSize:11, color:"#8FA8B2", flexShrink:0}}>{l}</span>
                  <span style={{fontSize:11, fontWeight:500, color:"#E8F0F3", textAlign:"right"}}>{String(v)}</span>
                </div>
              ))}
            </div>

            {/* Move deal */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Move to stage</div>
              <div style={{display:"flex", flexDirection:"column", gap:6}}>
                {columns.map(col=>(
                  <button key={col.id} onClick={()=>moveCard(selD.id, col.id)} style={{
                    background: selD.status===col.id?"rgba(29,158,117,0.12)":"rgba(143,168,178,0.04)",
                    border: selD.status===col.id?"1px solid rgba(29,158,117,0.3)":"1px solid rgba(143,168,178,0.12)",
                    borderRadius:7, padding:"7px 12px", color: selD.status===col.id?"#1D9E75":col.color,
                    fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"Inter, sans-serif", textAlign:"left"
                  }}>
                    {selD.status===col.id?"✓ ":""}{col.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <button style={{background:"#1D9E75", border:"none", borderRadius:10, padding:"10px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>✉️ Send follow-up</button>
              <button style={{background:"rgba(29,158,117,0.08)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:"10px", color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>🔒 Open escrow</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}