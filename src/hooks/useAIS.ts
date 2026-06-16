'use client';
import { useState, useEffect, useRef } from 'react';

export interface AISVessel {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  shipType: number;
  timestamp: number;
}

export function useAIS() {
  const [vessels, setVessels] = useState<Map<number, AISVessel>>(new Map());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/ais');
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'connected') {
          setConnected(true);
          setError(null);
        } else if (msg.type === 'vessel') {
          const pos = msg.data?.Message?.PositionReport;
          const meta = msg.data?.MetaData;

          if (pos && meta?.MMSI) {
            setVessels(prev => {
              const next = new Map(prev);
              next.set(meta.MMSI, {
                mmsi: meta.MMSI,
                name: meta.ShipName?.trim() || `MMSI ${meta.MMSI}`,
                lat: pos.Latitude,
                lon: pos.Longitude,
                speed: pos.Sog ?? 0,
                course: pos.Cog ?? 0,
                shipType: pos.ShipType ?? 0,
                timestamp: Date.now(),
              });
              return next;
            });
          }
        } else if (msg.type === 'error') {
          setError(msg.message);
          setConnected(false);
        }
      } catch {}
    };

    es.onerror = () => {
      setError('AIS bağlantısı kesildi');
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, []);

  return {
    vessels: Array.from(vessels.values()),
    connected,
    error,
    count: vessels.size,
  };
}
