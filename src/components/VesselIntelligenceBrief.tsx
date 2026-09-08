"use client";
import { useEffect, useState } from "react";

interface Props {
  vesselName:        string;
  imo:               string;
  age:               number;
  type:              string | null;
  flag:              string | null;
  ldt:               number | null;
  scrapScore:        number;
  detentionCount:    number;
  specialSurveyDate: string | null;
  signals:           { label: string; explanation: string }[];
  managerName:       string | null;
  ownerName:         string | null;
  estimatedValue:    string | null;
  arrestSummary?:    string | null;
}

export default function VesselIntelligenceBrief(props: Props) {
  const [brief, setBrief]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vessels/intelligence-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(props),
    })
      .then(r => r.json())
      .then(d => d.brief && setBrief(d.brief))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [props.imo]);

  if (loading) {
    return (
      <div style={{
        background: "#F0F9F6", border: "1px solid #A7F3D0",
        borderRadius: 10, padding: "14px 18px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 13, color: "#6B7280", fontStyle: "italic" }}>
          Analysing vessel intelligence…
        </span>
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div style={{
      background: "#F0F9F6", border: "1px solid #6EE7B7",
      borderRadius: 10, padding: "14px 18px", marginBottom: 20,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "#065F46", marginBottom: 6 }}>
        Intelligence Brief · Claude
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "#1F2937", lineHeight: 1.65 }}>
        {brief}
      </p>
    </div>
  );
}
