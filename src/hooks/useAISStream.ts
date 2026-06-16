"use client";
import { useState, useEffect, useRef } from "react";

export interface AISVessel {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  vesselType: number;
  length: number;
  width: number;
  draught: number;
  destination: string;
  timestamp: string;
  score: number;
  status: string;
  typeLabel: string;
}

const vesselTypeLabel = (type: number): string => {
  if (type >= 70 && type <= 79) return "Cargo";
  if (type >= 80 && type <= 89) return "Tanker";
  if (type >= 60 && type <= 69) return "Passenger";
  if (type >= 50 && type <= 59) return "Special";
  if (type >= 30 && type <= 39) return "Fishing";
  return "Other";
};

const computeScore = (vessel: Partial<AISVessel>): number => {
  let score = 0;
  const speed = vessel.speed || 0;
  if (speed < 0.5) score += 35;
  else if (speed < 2) score += 20;
  else if (speed < 5) score += 10;
  const type = vessel.vesselType || 0;
  if (type >= 70 && type <= 89) score += 25;
  else score += 10;
  const len = vessel.length || 0;
  if (len > 200) score += 20;
  else if (len > 150) score += 15;
  else if (len > 100) score += 10;
  const dest = (vessel.destination || "").toUpperCase();
  if (dest.includes("ALANG") || dest.includes("CHITTAGONG") ||
      dest.includes("GADANI") || dest.includes("ALIAGA")) score += 20;
  return Math.min(score, 99);
};

export function useAISStream() {
  const vesselMapRef = useRef<Map<string, AISVessel>>(new Map());
  const partialRef = useRef<Map<string, Partial<AISVessel>>>(new Map());
  const msgCountRef = useRef(0);

  const [vessels, setVessels] = useState<AISVessel[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    const es = new EventSource('/api/ais');

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') { setConnected(true); setError(null); return; }
        if (msg.type === 'error') { setError(msg.message); setConnected(false); return; }
        if (msg.type !== 'vessel') return;

        const data = msg.data;
        msgCountRef.current++;

        const mmsi =
          data.MetaData?.MMSI?.toString() ||
          data.Message?.PositionReport?.UserID?.toString() ||
          data.Message?.ShipStaticData?.UserID?.toString();
        if (!mmsi) return;

        const existing = partialRef.current.get(mmsi) || {};

        if (data.Message?.PositionReport) {
          const pos = data.Message.PositionReport;
          partialRef.current.set(mmsi, {
            ...existing, mmsi,
            lat: pos.Latitude, lon: pos.Longitude,
            speed: pos.SpeedOverGround ?? pos.Sog ?? 0,
            course: pos.CourseOverGround ?? pos.Cog ?? 0,
            timestamp: data.MetaData?.time_utc || new Date().toISOString(),
          });
        }

        if (data.Message?.ShipStaticData) {
          const stat = data.Message.ShipStaticData;
          const dim = stat.Dimension || {};
          partialRef.current.set(mmsi, {
            ...existing, mmsi,
            name: stat.Name?.trim() || existing.name || "",
            vesselType: stat.Type || existing.vesselType || 0,
            length: (dim.A || 0) + (dim.B || 0),
            width: (dim.C || 0) + (dim.D || 0),
            draught: stat.MaximumStaticDraught || 0,
            destination: stat.Destination?.trim() || existing.destination || "",
          });
        }

        if (data.MetaData?.ShipName) {
          const cur = partialRef.current.get(mmsi) || existing;
          partialRef.current.set(mmsi, { ...cur, name: data.MetaData.ShipName.trim() || cur.name || "" });
        }

        const v = partialRef.current.get(mmsi);
        if (v && v.lat !== undefined && v.name && v.name.length > 0) {
          if (vesselMapRef.current.size >= 1000 && !vesselMapRef.current.has(mmsi)) {
            const first = vesselMapRef.current.keys().next().value;
            if (first) vesselMapRef.current.delete(first);
          }
          vesselMapRef.current.set(mmsi, {
            mmsi: v.mmsi || mmsi, name: v.name,
            lat: v.lat || 0, lon: v.lon || 0,
            speed: v.speed || 0, course: v.course || 0,
            vesselType: v.vesselType || 0, length: v.length || 0,
            width: v.width || 0, draught: v.draught || 0,
            destination: v.destination || "",
            timestamp: v.timestamp || new Date().toISOString(),
            score: computeScore(v),
            status: (v.speed || 0) < 0.5 ? "Idle" : (v.speed || 0) < 3 ? "Slow" : "Active",
            typeLabel: vesselTypeLabel(v.vesselType || 0),
          });
        }
      } catch {}
    };

    es.onerror = () => { setError('AIS bağlantısı kesildi'); setConnected(false); };

    // Throttle: update React state once per second only
    const interval = setInterval(() => {
      setVessels(Array.from(vesselMapRef.current.values())
        .filter(v => v.name.trim() !== "")
        .sort((a, b) => b.score - a.score));
      setMessageCount(msgCountRef.current);
    }, 1000);

    return () => { es.close(); clearInterval(interval); };
  }, []);

  return { vessels, connected, error, messageCount };
}
