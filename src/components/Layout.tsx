"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/",        label: "Vessels"  },
  { href: "/markets", label: "Markets"  },
  { href: "/snp",     label: "S&P"      },
  { href: "/alerts",  label: "Alerts"   },
  { href: "/crm",     label: "Deal CRM" },
  { href: "/map",     label: "Map"      },
];

const TICKER = [
  { port: "Alang",      country: "India",      price: "501", delta: "−3", up: false },
  { port: "Chittagong", country: "Bangladesh", price: "541", delta: "+8", up: true  },
  { port: "Gadani",     country: "Pakistan",   price: "511", delta: "+2", up: true  },
  { port: "Aliağa",     country: "Turkey",     price: "332", delta: "+4", up: true  },
];

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
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        justifyContent: "space-between",
        background: "#fff",
        borderBottom: "1px solid #EAECF0",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5, color: "#101828" }}>
              Ship<span style={{ color: "#1D9E75" }}>Scout</span>
            </span>
          </Link>
          <div style={{ width: 1, height: 16, background: "#EAECF0", margin: "0 14px" }} />
          <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#98A2B3", textTransform: "uppercase" as const, fontWeight: 500 }}>
            Vessel Intelligence
          </span>
        </div>

        <div style={{ display: "flex", gap: 2 }}>
          {NAV.map(({ href, label }) => {
            const active = path === href;
            return (
              <Link key={href} href={href} style={{
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "#101828" : "#667085",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 6,
                background: active ? "#F2F4F7" : "none",
                borderBottom: active ? "2px solid #1D9E75" : "2px solid transparent",
                transition: "all 0.15s",
              }}>
                {label}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#98A2B3" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75", animation: "pulse-dot 2s infinite" }} />
            Live · {aisCount !== null ? `${aisCount.toLocaleString()} vessels` : "connecting..."}
          </div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1D9E75", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
            A
          </div>
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
          </div>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
