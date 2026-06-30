"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 16,
      fontFamily: "Inter, sans-serif", color: "#344054",
    }}>
      <div style={{ fontSize: 32 }}>⚠</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Veri yüklenemedi</div>
      <div style={{ fontSize: 13, color: "#667085", maxWidth: 320, textAlign: "center" }}>
        Bu bölüm geçici olarak kullanılamıyor. Diğer sayfalar çalışmaya devam ediyor.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8, padding: "9px 20px", background: "#1D9E75",
          border: "none", borderRadius: 8, color: "#fff",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        Tekrar dene
      </button>
      {error.digest && (
        <div style={{ fontSize: 10, color: "#98A2B3", fontFamily: "monospace" }}>
          ref: {error.digest}
        </div>
      )}
    </div>
  );
}
