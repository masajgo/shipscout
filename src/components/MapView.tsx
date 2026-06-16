"use client";
import { useEffect, useState, useRef } from "react";
import { useAISStream } from "@/hooks/useAISStream";
import { useOwnerContact } from "@/hooks/useOwnerContact";

const scoreColor = (s: number) => s >= 90 ? "#F87171" : s >= 80 ? "#FB923C" : s >= 70 ? "#FACC15" : "#4ADE80";
const scoreLabel = (s: number) => s >= 90 ? "Critical" : s >= 80 ? "High" : s >= 70 ? "Medium" : "Low";


function VesselPhoto({ mmsi, name, type }: { mmsi: string; name: string; type: string }) {
  const [imgSrc, setImgSrc] = useState(`https://img.vesseltracker.com/img/vessels/thumb-${mmsi}.jpg`);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const fallbacks = [
    `https://img.vesseltracker.com/img/vessels/thumb-${mmsi}.jpg`,
    `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb`,
    `https://www.vesseltracking.net/images/vessels/${mmsi}.jpg`,
  ];

  const handleError = () => {
    const next = attempt + 1;
    if (next < fallbacks.length) {
      setAttempt(next);
      setImgSrc(fallbacks[next]);
    } else {
      setFailed(true);
    }
  };

  const typeIcon: Record<string, string> = {
    "Cargo": "🚢",
    "Tanker": "🛢️",
    "Passenger": "🛳️",
    "Fishing": "🎣",
    "Special": "⚓",
    "Other": "⛴️",
  };

  return (
    <div style={{
      width:"100%", height:150, borderRadius:10, marginBottom:12, overflow:"hidden",
      background:"linear-gradient(135deg, #1A3A4A, #0F2733)",
      border:"1px solid rgba(143,168,178,0.2)",
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative"
    }}>
      {!failed ? (
        <img
          src={imgSrc}
          alt={name}
          onError={handleError}
          style={{
            width:"100%", height:"100%", objectFit:"cover",
            transition:"opacity 0.3s"
          }}
        />
      ) : (
        <div style={{textAlign:"center", padding:16}}>
          <div style={{fontSize:48, marginBottom:8}}>{typeIcon[type] || "🚢"}</div>
          <div style={{fontSize:11, color:"#8FA8B2", fontFamily:"monospace"}}>{type}</div>
          <div style={{fontSize:10, color:"rgba(143,168,178,0.5)", marginTop:4}}>No photo available</div>
        </div>
      )}
      {!failed && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, height:40,
          background:"linear-gradient(transparent, rgba(13,31,40,0.8))"
        }}/>
      )}
    </div>
  );
}

export default function MapView() {
  const { vessels, connected, messageCount } = useAISStream();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [selected, setSelected] = useState<typeof vessels[0] | null>(null);
  const { data: ownerData, loading: ownerLoading, fetchOwner } = useOwnerContact();
  const [minScore, setMinScore] = useState(50);
  const [typeFilter, setTypeFilter] = useState("All");
  const [mapReady, setMapReady] = useState(false);

  const filtered = vessels
    .filter(v => v.score >= minScore && (typeFilter === "All" || v.typeLabel === typeFilter))
    .slice(0, 300);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current || !mapRef.current) return;

    import("leaflet").then(L => {
      if (mapInstanceRef.current) return;
      
      const map = L.map(mapRef.current!, {
        center: [20, 40],
        zoom: 3,
        zoomControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 18 }
      ).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || typeof window === "undefined") return;

    import("leaflet").then(L => {
      const map = mapInstanceRef.current;
      const currentMMSIs = new Set(filtered.map(v => v.mmsi));

      // Remove stale markers
      markersRef.current.forEach((marker, mmsi) => {
        if (!currentMMSIs.has(mmsi)) {
          map.removeLayer(marker);
          markersRef.current.delete(mmsi);
        }
      });

      // Add/update markers
      filtered.forEach(v => {
        const color = scoreColor(v.score);
        const size = v.score >= 90 ? 14 : v.score >= 80 ? 11 : 9;

        const icon = L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(0,0,0,0.3);border-radius:50%;box-shadow:0 0 ${v.score>=80?8:4}px ${color}88;cursor:pointer;"></div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size/2, size/2],
        });

        if (markersRef.current.has(v.mmsi)) {
          markersRef.current.get(v.mmsi).setLatLng([v.lat, v.lon]).setIcon(icon);
        } else {
          const marker = L.marker([v.lat, v.lon], { icon });
          marker.on("click", () => {
            setSelected(v);
            fetchOwner(v.mmsi);
          });
          marker.bindTooltip(v.name, { permanent: false, direction: "top" });
          marker.addTo(map);
          markersRef.current.set(v.mmsi, marker);
        }
      });
    });
  }, [filtered, mapReady]);

  return (
    <div style={{fontFamily:"Inter, sans-serif", height:"100vh", background:"#0D1F28", color:"#E8F0F3", display:"flex", flexDirection:"column"}}>
      <style>{`
        .leaflet-tooltip { background:#1A3A4A !important; border:1px solid rgba(143,168,178,0.3) !important; color:#E8F0F3 !important; font-size:11px !important; font-family:monospace !important; }
        .leaflet-tooltip-top:before { border-top-color: rgba(143,168,178,0.3) !important; }
        .leaflet-control-attribution { background:rgba(13,31,40,0.8) !important; color:#8FA8B2 !important; }
        .leaflet-control-attribution a { color:#1D9E75 !important; }
      `}</style>

      {/* NAV */}
      <nav style={{background:"#0D1F28", borderBottom:"1px solid rgba(143,168,178,0.15)", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, flexShrink:0, zIndex:1000, position:"relative"}}>
        <div style={{display:"flex", alignItems:"center", gap:32}}>
          <div style={{fontFamily:"Space Grotesk, sans-serif", fontWeight:700, fontSize:18, letterSpacing:-0.5}}>
            <span style={{color:"#E8F0F3"}}>Ship</span><span style={{color:"#1D9E75"}}>Scout</span>
          </div>
          {[["Vessels","/"],["Markets","/markets"],["Map","/map"],["S&P","/snp"],["Deal CRM","/crm"],["Alerts","/alerts"]].map(([t,h])=>(
            <a key={t} href={h} style={{color:t==="Map"?"#1D9E75":"#8FA8B2", fontSize:13, fontWeight:500, textDecoration:"none", borderBottom:t==="Map"?"2px solid #1D9E75":"2px solid transparent", paddingBottom:2}}>{t}</a>
          ))}
        </div>
        <div style={{display:"flex", alignItems:"center", gap:16}}>
          <div style={{display:"flex", alignItems:"center", gap:6}}>
            <div style={{width:8, height:8, borderRadius:"50%", background: connected ? "#1D9E75" : "#FB923C"}}></div>
            <span style={{fontSize:12, color: connected ? "#1D9E75" : "#FB923C", fontFamily:"monospace"}}>
              {connected ? "Live AIS" : "Connecting..."}
            </span>
          </div>
          <span style={{fontSize:11, color:"#8FA8B2", fontFamily:"monospace"}}>{filtered.length} shown · {vessels.length} total · {messageCount.toLocaleString()} msgs</span>
        </div>
      </nav>

      <div style={{display:"flex", flex:1, overflow:"hidden"}}>

        {/* SIDEBAR */}
        <aside style={{width:200, background:"#0F2733", borderRight:"1px solid rgba(143,168,178,0.12)", padding:20, flexShrink:0, zIndex:500, overflowY:"auto"}}>
          <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:16}}>Filters</div>

          <div style={{marginBottom:20}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
              <div style={{fontSize:11, color:"#8FA8B2"}}>Min score</div>
              <div style={{fontSize:11, color:"#1D9E75", fontWeight:600}}>{minScore}+</div>
            </div>
            <input type="range" min={0} max={90} step={5} value={minScore}
              onChange={e=>setMinScore(Number(e.target.value))}
              style={{width:"100%", accentColor:"#1D9E75"}} />
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11, color:"#8FA8B2", marginBottom:8}}>Vessel type</div>
            {["All","Cargo","Tanker","Special","Fishing","Other"].map(t=>(
              <button key={t} onClick={()=>setTypeFilter(t)} style={{
                display:"block", width:"100%", textAlign:"left",
                background:typeFilter===t?"rgba(29,158,117,0.12)":"none",
                border:typeFilter===t?"1px solid rgba(29,158,117,0.3)":"1px solid transparent",
                borderRadius:6, padding:"5px 10px", color:typeFilter===t?"#1D9E75":"#8FA8B2",
                fontSize:12, cursor:"pointer", marginBottom:3, fontFamily:"Inter, sans-serif"
              }}>{t}</button>
            ))}
          </div>

          <div style={{borderTop:"1px solid rgba(143,168,178,0.12)", paddingTop:16}}>
            <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:10}}>Legend</div>
            {[["Critical 90+","#F87171"],["High 80+","#FB923C"],["Medium 70+","#FACC15"],["Low <70","#4ADE80"]].map(([l,c])=>(
              <div key={l} style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                <div style={{width:12, height:12, borderRadius:"50%", background:c, boxShadow:`0 0 6px ${c}88`, flexShrink:0}}></div>
                <span style={{fontSize:11, color:"#8FA8B2"}}>{l}</span>
              </div>
            ))}
          </div>

          <div style={{borderTop:"1px solid rgba(143,168,178,0.12)", paddingTop:16, marginTop:8}}>
            <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:10}}>Live stats</div>
            {[
              ["Total tracked", vessels.length],
              ["Showing", filtered.length],
              ["Critical 90+", vessels.filter(v=>v.score>=90).length],
              ["High 80+", vessels.filter(v=>v.score>=80).length],
              ["Idle", vessels.filter(v=>v.status==="Idle").length],
              ["Messages", messageCount.toLocaleString()],
            ].map(([l,v])=>(
              <div key={String(l)} style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
                <span style={{fontSize:11, color:"#8FA8B2"}}>{l}</span>
                <span style={{fontSize:11, fontWeight:600, color:"#E8F0F3"}}>{v}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAP */}
        <div style={{flex:1, position:"relative"}}>
          <div ref={mapRef} style={{width:"100%", height:"100%"}} />
          
          {/* Small status banner - not full overlay */}
          {!connected && vessels.length === 0 && (
            <div style={{
              position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)",
              background:"rgba(13,31,40,0.9)", border:"1px solid rgba(251,146,60,0.4)",
              borderRadius:10, padding:"10px 20px", zIndex:400,
              display:"flex", alignItems:"center", gap:10
            }}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#FB923C", flexShrink:0}}></div>
              <span style={{fontSize:12, color:"#E8F0F3", fontFamily:"monospace"}}>
                Connecting to AIS stream... vessels loading
              </span>
            </div>
          )}

          {connected && vessels.length === 0 && (
            <div style={{
              position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)",
              background:"rgba(13,31,40,0.9)", border:"1px solid rgba(29,158,117,0.4)",
              borderRadius:10, padding:"10px 20px", zIndex:400,
              display:"flex", alignItems:"center", gap:10
            }}>
              <div style={{width:8, height:8, borderRadius:"50%", background:"#1D9E75", flexShrink:0}}></div>
              <span style={{fontSize:12, color:"#1D9E75", fontFamily:"monospace"}}>
                Connected — receiving vessel data...
              </span>
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selected && (
          <aside style={{width:260, background:"#0F2733", borderLeft:"1px solid rgba(143,168,178,0.12)", padding:20, overflowY:"auto", flexShrink:0, zIndex:500}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:10, fontWeight:600, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em"}}>Live Vessel</div>
              <button onClick={()=>setSelected(null)} style={{background:"none", border:"none", color:"#8FA8B2", cursor:"pointer", fontSize:20}}>×</button>
            </div>

            {/* Vessel Photo */}
            <VesselPhoto mmsi={selected.mmsi} name={selected.name} type={selected.typeLabel} />

            <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:15, fontWeight:700, color:"#E8F0F3", marginBottom:3}}>{selected.name}</div>
            <div style={{fontSize:12, color:"#8FA8B2", marginBottom:14}}>MMSI: {selected.mmsi} · {selected.typeLabel}</div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:14, marginBottom:12, textAlign:"center"}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4}}>Scrap Score</div>
              <div style={{fontFamily:"Space Grotesk, sans-serif", fontSize:30, fontWeight:700, color:scoreColor(selected.score)}}>
                {selected.score}<span style={{fontSize:12, color:"#8FA8B2"}}>/100</span>
              </div>
              <div style={{fontSize:11, fontWeight:600, color:scoreColor(selected.score), marginTop:3}}>{scoreLabel(selected.score)}</div>
              <div style={{marginTop:8, height:4, background:"rgba(143,168,178,0.1)", borderRadius:2, overflow:"hidden"}}>
                <div style={{height:"100%", width:`${selected.score}%`, background:scoreColor(selected.score), borderRadius:2}}></div>
              </div>
            </div>

            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Live Data</div>
              {[
                ["Position", `${selected.lat.toFixed(4)}°, ${selected.lon.toFixed(4)}°`],
                ["Speed", `${selected.speed.toFixed(1)} kn`],
                ["Course", `${selected.course.toFixed(0)}°`],
                ["Status", selected.status],
                ["Length", `${selected.length}m`],
                ["Draught", `${selected.draught}m`],
                ["Destination", selected.destination || "Unknown"],
                ["Updated", new Date(selected.timestamp).toLocaleTimeString()],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:7, gap:8}}>
                  <span style={{fontSize:11, color:"#8FA8B2"}}>{l}</span>
                  <span style={{fontSize:11, fontWeight:500, color:"#E8F0F3", textAlign:"right"}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Owner Contact - Datalastic */}
            <div style={{background:"#1A3A4A", border:"1px solid rgba(143,168,178,0.15)", borderRadius:10, padding:14, marginBottom:12}}>
              <div style={{fontSize:9, color:"#8FA8B2", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>
                Owner Contact
                {ownerLoading && <span style={{color:"#1D9E75", marginLeft:8}}>● Loading...</span>}
              </div>

              {ownerLoading && (
                <div style={{textAlign:"center", padding:"12px 0"}}>
                  <div style={{fontSize:11, color:"#1D9E75", fontFamily:"monospace"}}>Fetching from Datalastic...</div>
                </div>
              )}

              {ownerData && !ownerLoading && (
                <div>
                  {ownerData.vessel && (
                    <div style={{marginBottom:10, paddingBottom:10, borderBottom:"1px solid rgba(143,168,178,0.1)"}}>
                      {[
                        ["IMO", ownerData.vessel.imo],
                        ["Flag", ownerData.vessel.flag],
                        ["DWT", ownerData.vessel.deadweight?.toLocaleString()+" t"],
                        ["Built", ownerData.vessel.year_built],
                        ["Length", ownerData.vessel.length+"m"],
                      ].map(([l,v])=> v && (
                        <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:5}}>
                          <span style={{fontSize:10, color:"#8FA8B2"}}>{l}</span>
                          <span style={{fontSize:10, fontWeight:500, color:"#E8F0F3"}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {ownerData.ownership ? (
                    <div>
                      {[
                        ["Registered owner", ownerData.ownership.registered_owner],
                        ["Beneficial owner", ownerData.ownership.beneficial_owner],
                        ["Operator", ownerData.ownership.operator],
                        ["Ship manager", ownerData.ownership.ship_manager],
                        ["Country", ownerData.ownership.country],
                        ["Email", ownerData.ownership.contact_email],
                        ["Phone", ownerData.ownership.contact_phone],
                      ].map(([l,v])=> v && (
                        <div key={l} style={{display:"flex", justifyContent:"space-between", marginBottom:5, gap:8}}>
                          <span style={{fontSize:10, color:"#8FA8B2", flexShrink:0}}>{l}</span>
                          <span style={{fontSize:10, fontWeight:500, color: l==="Email"?"#1D9E75":"#E8F0F3", textAlign:"right", wordBreak:"break-all"}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{fontSize:11, color:"#8FA8B2", textAlign:"center", padding:"8px 0"}}>
                      No ownership data found
                    </div>
                  )}
                </div>
              )}

              {!ownerData && !ownerLoading && (
                <div style={{fontSize:11, color:"rgba(143,168,178,0.5)", textAlign:"center", padding:"8px 0"}}>
                  Click vessel to load owner
                </div>
              )}
            </div>

            <div style={{display:"flex", flexDirection:"column", gap:8}}>
              <button style={{background:"#1D9E75", border:"none", borderRadius:10, padding:11, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                ✉️ Draft offer email →
              </button>
              <button style={{background:"rgba(29,158,117,0.08)", border:"1px solid rgba(29,158,117,0.2)", borderRadius:10, padding:11, color:"#1D9E75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"Inter, sans-serif"}}>
                📋 Add to CRM
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}