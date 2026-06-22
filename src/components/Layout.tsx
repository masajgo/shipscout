"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { SCRAP_MARKETS } from "@/lib/scrapMarkets";

const NAV = [
  { href: "/",        label: "Vessels"  },
  { href: "/markets", label: "Markets"  },
  { href: "/snp",     label: "S&P"      },
  { href: "/compare", label: "Compare"  },
  { href: "/alerts",  label: "Alerts"   },
  { href: "/crm",     label: "Deal CRM" },
  { href: "/map",     label: "Map"      },
];

const TICKER_DELTAS: Record<string, { delta: string; up: boolean }> = {
  "Alang":      { delta: "−3", up: false },
  "Chittagong": { delta: "+8", up: true },
  "Gadani":     { delta: "+2", up: true },
  "Aliağa":     { delta: "+4", up: true },
};

const TICKER = SCRAP_MARKETS.map(m => ({
  port: m.market, country: m.country, price: String(m.price),
  ...( TICKER_DELTAS[m.market] ?? { delta: "", up: true }),
}));

export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [aisCount, setAisCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/ais").then(r => r.json()).then(d => {
      const n = d.total ?? (Array.isArray(d.vessels) ? d.vessels.length : null);
      if (n !== null) setAisCount(n);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB" }}>

      {/* NAV */}
      <nav style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        justifyContent: "space-between",
        background: "#0B1E3D",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: "#FFFFFF" }}>
              Ship<span style={{ color: "#C9A84C" }}>Scout</span>
            </span>
          </Link>
        </div>

        <div style={{ display: "flex", gap: 2 }}>
          {NAV.map(({ href, label }) => {
            const active = path === href;
            return (
              <Link key={href} href={href} style={{
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "#FFFFFF" : "rgba(255,255,255,0.7)",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 6,
                background: "none",
                borderBottom: active ? "2px solid #C9A84C" : "2px solid transparent",
                transition: "all 0.15s",
              }}>
                {label}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#C9A84C" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A84C", animation: "pulse-dot 2s infinite" }} />
            Live · {aisCount !== null ? `${aisCount.toLocaleString()} vessels` : "connecting..."}
          </div>
          <button style={{
            padding: "7px 16px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius: 6,
            color: "white",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}>
            Sign in
          </button>
          <button style={{
            padding: "7px 16px",
            background: "#C9A84C",
            border: "none",
            borderRadius: 6,
            color: "#0B1E3D",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}>
            Get Access
          </button>
        </div>
      </nav>

      {/* TICKER — hidden on /map to give map full height */}
      {path !== "/map" && (
        <div style={{ background: "#101828", display: "flex", padding: "0 32px" }}>
          {TICKER.map((t, i) => (
            <div key={t.port} style={{
              padding: "12px 26px",
              borderRight: "1px solid rgba(255,255,255,0.1)",
              display: "flex", flexDirection: "column", gap: 3,
              ...(i === 0 ? { paddingLeft: 0 } : {}),
            }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em", textTransform: "uppercase" as const, fontWeight: 600 }}>
                {t.port} · {t.country}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF" }}>{t.price}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}>$/LDT</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.up ? "#34D399" : "#FB7185" }}>{t.delta}</div>
              </div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", alignSelf: "center" }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
              Jun 2026 · $/LDT benchmark
            </span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 12 }}>
              Updated 2h ago
            </span>
          </div>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
