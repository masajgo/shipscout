"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type VesselInfo = {
  imo: string; name: string; type: string; flag: string;
  builtYear: number; scrapScore: number; scrapCategory: string;
};

const CURRENCIES = ["USD", "EUR", "GBP"];
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 13, borderRadius: 8,
  border: "1px solid #D0D5DD", outline: "none", fontFamily: "Inter, sans-serif",
  color: "#101828", background: "#fff", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "#344054", display: "block", marginBottom: 5 };
const SECTION: React.CSSProperties = { background: "#fff", border: "1px solid #EAECF0", borderRadius: 10, padding: "20px 22px", marginBottom: 16 };

export default function NewListingPage() {
  const router = useRouter();

  const [imoInput, setImoInput]     = useState("");
  const [vessel, setVessel]         = useState<VesselInfo | null>(null);
  const [imoError, setImoError]     = useState("");
  const [imoLoading, setImoLoading] = useState(false);

  type Suggestion = { imo: string; name: string; type: string; flag: string; builtYear: number };
  const [nameQuery, setNameQuery]           = useState("");
  const [suggestions, setSuggestions]       = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listingType, setListingType] = useState<"sale"|"charter"|"scrap">("sale");
  const [priceUsd, setPriceUsd]       = useState("");
  const [currency, setCurrency]       = useState("USD");
  const [description, setDescription] = useState("");

  const [brokerName,    setBrokerName]    = useState("");
  const [brokerEmail,   setBrokerEmail]   = useState("");
  const [brokerPhone,   setBrokerPhone]   = useState("");
  const [brokerCompany, setBrokerCompany] = useState("");

  const [photos, setPhotos]               = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function handleNameChange(val: string) {
    setNameQuery(val);
    setSuggestions([]);
    setShowSuggestions(false);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (val.trim().length < 2) return;
    suggestTimer.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await fetch(`/api/listings/vessel-search?q=${encodeURIComponent(val.trim())}`);
        if (res.ok) {
          const data: Suggestion[] = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } finally {
        setSuggestLoading(false);
      }
    }, 300);
  }

  async function selectSuggestion(imo: string) {
    setShowSuggestions(false);
    setSuggestions([]);
    setNameQuery("");
    setImoInput(imo);
    setImoError("");
    setImoLoading(true);
    const res = await fetch(`/api/listings/imo-lookup?imo=${imo}`);
    if (res.ok) {
      setVessel(await res.json());
    } else {
      setImoError("Vessel lookup failed");
    }
    setImoLoading(false);
  }

  async function lookupIMO() {
    const imo = imoInput.trim();
    if (!/^\d{7}$/.test(imo)) { setImoError("IMO must be exactly 7 digits"); return; }
    setImoError(""); setImoLoading(true); setVessel(null);
    const res = await fetch(`/api/listings/imo-lookup?imo=${imo}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setImoError(j.error || "Vessel not found in our database");
    } else {
      setVessel(await res.json());
    }
    setImoLoading(false);
  }

  async function uploadPhoto(file: File) {
    if (photos.length >= 10) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/listings/upload", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setPhotos(p => [...p, url]);
    }
    setUploadingPhoto(false);
  }

  async function generateDescription() {
    if (!vessel) return;
    setAiError(""); setAiLoading(true);
    const res = await fetch("/api/listings/ai-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vessel, listingType, draft: description }),
    });
    if (res.ok) {
      const { description: text } = await res.json();
      setDescription(text);
    } else {
      setAiError("Could not generate description — try again");
    }
    setAiLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vessel) { setSubmitError("Look up an IMO first"); return; }
    setSubmitError(""); setSubmitting(true);

    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imo: vessel.imo, vessel_name: vessel.name,
        listing_type: listingType,
        price_usd: priceUsd ? parseFloat(priceUsd) : null,
        currency, description, images: photos,
        broker_name: brokerName, broker_email: brokerEmail,
        broker_phone: brokerPhone, broker_company: brokerCompany,
      }),
    });

    if (res.ok) {
      router.push("/broker/listings");
    } else {
      const j = await res.json().catch(() => ({}));
      setSubmitError(j.error || "Submission failed — please try again");
    }
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #EAECF0", padding: "16px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => router.back()} style={{ color: "#667085", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>←</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#101828" }}>New Listing</div>
          <div style={{ fontSize: 12, color: "#98A2B3" }}>Submit your vessel for sale, charter, or scrap</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* 1. Vessel */}
        <div style={SECTION}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828", marginBottom: 14 }}>1. Vessel</div>
          <label style={LABEL}>IMO Number</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input style={{ ...INPUT, flex: 1 }} type="text" placeholder="e.g. 9038828" maxLength={7}
              value={imoInput} onChange={e => { setImoInput(e.target.value); setImoError(""); }}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), lookupIMO())} />
            <button type="button" onClick={lookupIMO} disabled={imoLoading}
              style={{ padding: "10px 18px", background: "#101828", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              {imoLoading ? "…" : "Look up"}
            </button>
          </div>
          {imoError && <div style={{ fontSize: 12, color: "#B42318", marginBottom: 8 }}>{imoError}</div>}

          {/* Name search with autocomplete */}
          {!vessel && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#98A2B3", textAlign: "center" as const, marginBottom: 8 }}>
                — ya da gemi adıyla ara —
              </div>
              <div style={{ position: "relative" as const }}>
                <input
                  style={{ ...INPUT }}
                  type="text"
                  placeholder="e.g. Maersk Alberta, Atlantic Star…"
                  value={nameQuery}
                  onChange={e => handleNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off"
                />
                {suggestLoading && (
                  <div style={{ position: "absolute" as const, right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#98A2B3" }}>
                    …
                  </div>
                )}
                {showSuggestions && (
                  <div style={{
                    position: "absolute" as const, top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "#fff", border: "1px solid #EAECF0", borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)", zIndex: 50, overflow: "hidden",
                  }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={s.imo}
                        type="button"
                        onMouseDown={() => selectSuggestion(s.imo)}
                        style={{
                          display: "flex", alignItems: "center", width: "100%",
                          padding: "10px 14px", background: "none", border: "none",
                          borderBottom: i < suggestions.length - 1 ? "1px solid #F2F4F7" : "none",
                          cursor: "pointer", textAlign: "left" as const, gap: 10,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828" }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 1 }}>
                            IMO {s.imo} · {s.type} · {s.flag} · {s.builtYear}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {vessel && (
            <div style={{ background: "#F9FAFB", border: "1px solid #EAECF0", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#101828", marginBottom: 6 }}>{vessel.name}</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                {[
                  { label: "IMO",   val: vessel.imo        },
                  { label: "Type",  val: vessel.type        },
                  { label: "Flag",  val: vessel.flag        },
                  { label: "Built", val: vessel.builtYear   },
                  vessel.scrapScore ? { label: "Scrap", val: `${vessel.scrapScore}/100` } : null,
                ].filter(Boolean).map(s => s && (
                  <div key={s.label}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: "#98A2B3", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {vessel.scrapCategory === "critical" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#B42318", fontWeight: 500 }}>
                  High scrap risk — consider listing as scrap to attract relevant buyers.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Listing Details */}
        <div style={SECTION}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828", marginBottom: 14 }}>2. Listing Details</div>
          <label style={LABEL}>Type</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["sale","charter","scrap"] as const).map(t => (
              <button key={t} type="button" onClick={() => setListingType(t)}
                style={{ flex: 1, padding: "9px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1.5px solid ${listingType === t ? "#1D9E75" : "#EAECF0"}`,
                  background: listingType === t ? "#ECFDF3" : "#fff",
                  color: listingType === t ? "#1D9E75" : "#667085" }}>
                {t === "sale" ? "For Sale" : t === "charter" ? "Charter" : "For Scrap"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>Asking Price{listingType === "charter" ? " (daily/lump sum)" : ""}</label>
              <input style={INPUT} type="number" placeholder="e.g. 3500000" min="0" value={priceUsd} onChange={e => setPriceUsd(e.target.value)} />
            </div>
            <div style={{ width: 90 }}>
              <label style={LABEL}>Currency</label>
              <select style={{ ...INPUT }} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <label style={LABEL}>Description <span style={{ color: "#98A2B3", fontWeight: 400 }}>(min. 20 characters)</span></label>
          <textarea style={{ ...INPUT, height: 120, resize: "vertical" as const }}
            placeholder="Describe the vessel condition, history, reason for sale, charter terms, or any relevant details..."
            value={description} onChange={e => setDescription(e.target.value)} required minLength={20} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <div style={{ fontSize: 11, color: description.length < 20 ? "#B42318" : "#98A2B3" }}>
              {description.length} / 20 minimum
            </div>
            <button type="button" onClick={generateDescription} disabled={!vessel || aiLoading}
              style={{ fontSize: 11, fontWeight: 600, color: vessel ? "#1D9E75" : "#98A2B3", background: "none", border: "none", cursor: vessel ? "pointer" : "default", padding: 0 }}>
              {aiLoading ? "Writing…" : "✦ Write with AI"}
            </button>
          </div>
          {aiError && <div style={{ fontSize: 11, color: "#B42318", marginTop: 2 }}>{aiError}</div>}
        </div>

        {/* 3. Photos */}
        <div style={SECTION}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828", marginBottom: 4 }}>3. Photos</div>
          <div style={{ fontSize: 12, color: "#667085", marginBottom: 14 }}>Up to 10 photos. Only photos you own or have rights to use.</div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => {
              Array.from(e.target.files || []).slice(0, 10 - photos.length).forEach(uploadPhoto);
              e.target.value = "";
            }} />
          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
              {photos.map(url => (
                <div key={url} style={{ position: "relative" as const }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 6, border: "1px solid #EAECF0" }} />
                  <button type="button" onClick={() => setPhotos(p => p.filter(x => x !== url))}
                    style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(16,24,40,0.65)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingPhoto || photos.length >= 10}
            style={{ padding: "9px 18px", background: "#fff", border: "1px dashed #D0D5DD", borderRadius: 8, fontSize: 12, color: "#667085", cursor: "pointer" }}>
            {uploadingPhoto ? "Uploading…" : photos.length >= 10 ? "Max 10 photos" : "+ Add photos"}
          </button>
        </div>

        {/* 4. Contact */}
        <div style={SECTION}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#101828", marginBottom: 14 }}>4. Contact Information</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Your name <span style={{ color: "#B42318" }}>*</span></label>
              <input style={INPUT} type="text" value={brokerName} onChange={e => setBrokerName(e.target.value)} required placeholder="John Smith" />
            </div>
            <div>
              <label style={LABEL}>Company</label>
              <input style={INPUT} type="text" value={brokerCompany} onChange={e => setBrokerCompany(e.target.value)} placeholder="Acme Shipbrokers" />
            </div>
            <div>
              <label style={LABEL}>Email <span style={{ color: "#B42318" }}>*</span></label>
              <input style={INPUT} type="email" value={brokerEmail} onChange={e => setBrokerEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div>
              <label style={LABEL}>Phone</label>
              <input style={INPUT} type="tel" value={brokerPhone} onChange={e => setBrokerPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
          </div>
        </div>

        {submitError && (
          <div style={{ background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#B42318", marginBottom: 16 }}>
            {submitError}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => router.back()}
            style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #EAECF0", borderRadius: 8, fontSize: 13, color: "#667085", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !vessel}
            style={{ flex: 2, padding: 12, background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: submitting || !vessel ? 0.65 : 1 }}>
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#98A2B3", textAlign: "center", marginTop: 12 }}>
          Your listing will be reviewed before being published on the S&amp;P page.
        </div>
      </form>
    </div>
  );
}
