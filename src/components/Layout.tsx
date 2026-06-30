"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/",         label: "Dashboard" },
  { href: "/vessels",  label: "Vessels"   },
  { href: "/markets",  label: "Markets"   },
  { href: "/snp",      label: "S&P"       },
  { href: "/compare",  label: "Compare"   },
  { href: "/alerts",   label: "Alerts"    },
  { href: "/crm",      label: "Deal CRM"  },
  { href: "/map",      label: "Map"       },
];

// Static deltas (directional arrows) — updated weekly alongside seed data
const TICKER_DELTAS: Record<string, { delta: string; up: boolean }> = {
  "Alang":      { delta: "−3", up: false },
  "Chittagong": { delta: "+8", up: true },
  "Gadani":     { delta: "+2", up: true },
  "Aliağa":     { delta: "+4", up: true },
};

type TickerItem = { port: string; country: string; price: string; delta: string; up: boolean };

const FALLBACK_TICKER: TickerItem[] = [
  { port:"Chittagong", country:"Bangladesh", price:"420", delta:"+8", up:true },
  { port:"Gadani",     country:"Pakistan",   price:"410", delta:"+2", up:true },
  { port:"Alang",      country:"India",      price:"400", delta:"−3", up:false },
  { port:"Aliağa",     country:"Turkey",     price:"280", delta:"+4", up:true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [aisCount, setAisCount] = useState<number | null>(null);
  const [ticker, setTicker] = useState<TickerItem[]>(FALLBACK_TICKER);

  useEffect(() => {
    fetch("/api/ais").then(r => r.json()).then(d => {
      const n = d.total ?? (Array.isArray(d.vessels) ? d.vessels.length : null);
      if (n !== null) setAisCount(n);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/scrap-prices")
      .then(r => r.json())
      .then(d => {
        if (!d.yards) return;
        const items: TickerItem[] = Object.entries(d.yards as Record<string, { country: string; prices: Record<string, number> }>)
          .map(([name, y]) => {
            // headline: tanker price or bulker fallback
            const price = y.prices.tanker ?? y.prices.bulker ?? 0;
            const deltas = TICKER_DELTAS[name] ?? { delta: "", up: true };
            return { port: name, country: y.country, price: String(price), ...deltas };
          })
          .sort((a, b) => Number(b.price) - Number(a.price));
        if (items.length) setTicker(items);
      })
      .catch(() => {});
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
        background: "#07122E",
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
            color: "#07122E",
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
        <div style={{ background: "#050F24", display: "flex", padding: "0 32px" }}>
          {ticker.map((t, i) => (
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
