"use client";
import { useState } from "react";
import Alerts from "@/components/Alerts";
import HotNews from "@/components/HotNews";

export default function AlertsPage() {
  const [tab, setTab] = useState<"alerts" | "news">("alerts");

  return (
    <div style={{ fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", height: "calc(100vh - 94px)", background: "#F9FAFB" }}>

      {/* TABS */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "0 28px", display: "flex", flexShrink: 0 }}>
        {([["alerts", "Vessel Alerts"], ["news", "Hot News"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: "none", border: "none",
              borderBottom: tab === id ? "2px solid #1D9E75" : "2px solid transparent",
              padding: "12px 20px",
              color: tab === id ? "#101828" : "#667085",
              fontSize: 13, fontWeight: tab === id ? 600 : 400,
              cursor: "pointer", fontFamily: "Inter, sans-serif",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "alerts" ? (
          <Alerts />
        ) : (
          <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
            <HotNews />
          </div>
        )}
      </div>
    </div>
  );
}
