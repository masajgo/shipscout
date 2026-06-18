"use client";
import { useState, useEffect, useRef } from "react";

export interface AISVessel {
  mmsi: string; name: string;
  lat: number; lon: number;
  speed: number; course: number;
  vesselType: number; length: number; width: number;
  draught: number; destination: string; timestamp: string;
  score: number; status: string; typeLabel: string;
}

const vesselTypeLabel = (t: number) =>
  t >= 70 && t <= 79 ? "Cargo" :
  t >= 80 && t <= 89 ? "Tanker" :
  t >= 60 && t <= 69 ? "Passenger" :
  t >= 50 && t <= 59 ? "Special" :
  t >= 30 && t <= 39 ? "Fishing" : "Other";

const computeScore = (v: Partial<AISVessel>): number => {
  let s = 0;
  const spd = v.speed || 0;
  if (spd < 0.5) s += 35; else if (spd < 2) s += 20; else if (spd < 5) s += 10;
  const t = v.vesselType || 0;
  s += (t >= 70 && t <= 89) ? 25 : 10;
  const l = v.length || 0;
  if (l > 200) s += 20; else if (l > 150) s += 15; else if (l > 100) s += 10;
  const d = (v.destination || "").toUpperCase();
  if (d.includes("ALANG") || d.includes("CHITTAGONG") || d.includes("GADANI") || d.includes("ALIAGA")) s += 20;
  return Math.min(s, 99);
};

export function useAISStream() {
  const vesselMapRef = useRef<Map<string, AISVessel>>(new Map());
  const msgCountRef = useRef(0);

  const [vessels, setVessels] = useState<AISVessel[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    let destroyed = false;

    const poll = async () => {
      if (destroyed) return;
      try {
        const res = await fetch("/api/ais");
        if (!res.ok) throw new Error("fetch failed");
        const { vessels: raw } = await res.json();

        raw.forEach((v: any) => {
          if (!v.mmsi || !v.name || v.lat === undefined) return;
          msgCountRef.current++;
          vesselMapRef.current.set(v.mmsi, {
            ...v,
            score: computeScore(v),
            status: v.speed < 0.5 ? "Idle" : v.speed < 3 ? "Slow" : "Active",
            typeLabel: vesselTypeLabel(v.vesselType || 0),
          });
        });

        if (!destroyed) {
          setConnected(true);
          setError(null);
          setVessels(
            Array.from(vesselMapRef.current.values()).sort((a, b) => b.score - a.score)
          );
          setMessageCount(msgCountRef.current);
        }
      } catch {
        if (!destroyed) { setConnected(false); setError("AIS connection error"); }
      }
    };

    poll();
    const iv = setInterval(poll, 10_000);
    return () => { destroyed = true; clearInterval(iv); };
  }, []);

  return { vessels, connected, error, messageCount };
}
