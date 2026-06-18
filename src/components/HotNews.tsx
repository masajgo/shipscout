"use client";
import { useEffect, useState, useCallback } from "react";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  vessel: string | null;
  imo: string | null;
  source: string;
  category: string;
  distressType: string;
  severity: "high" | "medium" | "low";
  confidence: number;
  link: string;
  pubDate: string;
  watching: boolean;
};

type Meta = { total: number; high: number; medium: number; feedsActive: number; updatedAt: string };

const BADGE: Record<string, string> = {
  arrest:   "bg-red-50   text-red-700",
  financial:"bg-amber-50 text-amber-700",
  layup:    "bg-blue-50  text-blue-700",
  insurance:"bg-pink-50  text-pink-700",
  scrap:    "bg-green-50 text-green-700",
};
const BADGE_LABEL: Record<string, string> = {
  arrest:"Arrest", financial:"Financial", layup:"Lay-up", insurance:"P&I", scrap:"Scrap"
};
const SEVERITY_BORDER: Record<string, string> = {
  high:   "border-l-[3px] border-l-red-400",
  medium: "border-l-[3px] border-l-amber-400",
  low:    "border-l-[3px] border-l-green-400",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HotNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filter, setFilter] = useState("all");
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      setItems(data.items || []);
      setMeta(data.meta || null);
      setLastFetch(new Date());
    } catch {
      // sessiz hata
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 6 * 60 * 60 * 1000); // 6 saatte bir
    return () => clearInterval(interval);
  }, [fetchNews]);

  const toggleWatch = (id: string) => {
    setWatched(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const FILTERS = [
    { key: "all",       label: "All" },
    { key: "high",      label: "🔴 High priority" },
    { key: "maritime",  label: "Maritime" },
    { key: "cruise",    label: "Cruise" },
    { key: "arrest",    label: "Arrest" },
    { key: "financial", label: "Financial" },
    { key: "layup",     label: "Lay-up" },
  ];

  const filtered = items.filter(i => {
    if (filter === "all")      return true;
    if (filter === "high")     return i.severity === "high";
    if (filter === "maritime") return i.category === "maritime";
    if (filter === "cruise")   return i.category === "cruise";
    return i.distressType === filter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Scanning feeds...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-white font-medium text-base">Hot News</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs">
            {lastFetch ? `Updated ${timeAgo(lastFetch.toISOString())}` : ""} · {meta?.total ?? 0} signals
          </span>
          <button
            onClick={fetchNews}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      {meta && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "High priority", value: meta.high,       color: "text-red-400" },
            { label: "Medium",        value: meta.medium,      color: "text-amber-400" },
            { label: "Watching",      value: watched.size,     color: "text-[#1D9E75]" },
            { label: "Feeds active",  value: meta.feedsActive, color: "text-slate-300" },
          ].map(s => (
            <div key={s.label} className="bg-[#0D1F28] rounded-lg p-3 text-center">
              <div className={`text-xl font-medium ${s.color}`}>{s.value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              filter === f.key
                ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
                : "bg-transparent text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* News list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Bu filtrede sinyal yok
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              className={`bg-[#0D1F28] rounded-r-xl border border-slate-800 p-4 ${SEVERITY_BORDER[item.severity]}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-slate-200 text-sm font-medium leading-snug flex-1">
                  {item.title}
                </p>
                <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[item.distressType] ?? "bg-slate-800 text-slate-400"}`}>
                    {BADGE_LABEL[item.distressType] ?? item.distressType}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${item.category === "cruise" ? "bg-teal-50 text-teal-700" : "bg-indigo-50 text-indigo-700"}`}>
                    {item.category === "cruise" ? "Cruise" : "Maritime"}
                  </span>
                </div>
              </div>

              <p className="text-slate-400 text-xs leading-relaxed mb-3">
                {item.summary}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  {item.vessel && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[#1D9E75] bg-[#1D9E75]/10 px-2 py-1 rounded">
                      ⚓ {item.vessel}{item.imo ? ` · IMO ${item.imo}` : ""}
                    </span>
                  )}
                  <span className="text-slate-500 text-[11px]">{timeAgo(item.pubDate)}</span>
                  <span className="text-slate-500 text-[11px]">{item.source}</span>
                  <span className="text-slate-500 text-[11px]" title={`AI confidence: ${item.confidence}%`}>
                    {item.confidence}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-slate-300 text-[11px] transition-colors"
                  >
                    Kaynak ↗
                  </a>
                  <button
                    onClick={() => toggleWatch(item.id)}
                    className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
                      watched.has(item.id)
                        ? "bg-[#1D9E75] text-white border-[#1D9E75]"
                        : "bg-transparent text-slate-400 border-slate-700 hover:bg-[#1A3A4A] hover:text-white hover:border-[#1A3A4A]"
                    }`}
                  >
                    {watched.has(item.id) ? "👁 Watching" : "Watch"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
