"use client";
import React from "react";

interface Props {
  children: React.ReactNode;
  label?: string;        // e.g. "Markets widget" for console
  fallback?: React.ReactNode;
}

interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        padding: "24px 20px", textAlign: "center" as const,
        border: "1px solid #FECDCA", borderRadius: 12,
        background: "#FFF9F9", color: "#667085",
        fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 4 }}>
          Veri yüklenemedi
        </div>
        <div style={{ fontSize: 12, marginBottom: 14 }}>
          Bu bölüm geçici olarak kullanılamıyor.
        </div>
        <button
          onClick={this.reset}
          style={{
            padding: "6px 16px", background: "#fff",
            border: "1px solid #EAECF0", borderRadius: 6,
            fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#344054",
          }}
        >
          Tekrar dene
        </button>
      </div>
    );
  }
}
