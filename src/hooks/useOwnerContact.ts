"use client";
import { useState, useCallback } from "react";

export interface OwnerData {
  vessel?: {
    imo?: string;
    flag?: string;
    deadweight?: number;
    year_built?: number;
    length?: number;
  };
  ownership?: {
    registered_owner?: string;
    beneficial_owner?: string;
    operator?: string;
    ship_manager?: string;
    country?: string;
    contact_email?: string;
    contact_phone?: string;
  } | null;
}

export function useOwnerContact() {
  const [data, setData] = useState<OwnerData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOwner = useCallback(async (mmsi: string) => {
    setData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/owner?mmsi=${mmsi}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setData({});
      }
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchOwner };
}
