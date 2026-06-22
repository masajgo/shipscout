# ShipScout Sprint Report — June 2026

## Summary

Full development sprint across 10 tasks covering design system, vessel intelligence, code quality, security, and live data integration.

---

## Task Completion

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Color Palette + Typography | ✓ Complete | Already done — verified globals.css (@theme, CSS vars, badge classes, typography) and Layout.tsx (navy nav, gold Scout/badge/avatar) |
| 2 | Vessel Panel Improvements | ✓ Complete | Est. Scrap Value row present with ~$X.XM @ Aliağa format; owner section has S&P/GENEL/TAHMİNİ badges; gentle "toplanıyor" message in MapView; JSON button already removed |
| 3 | Code Review Medium Fixes | ✓ Complete | #6: scrapMarkets.ts created, imported by VesselPanel, Layout ticker, snp/route, alerts/route. #10: DB errors no longer leak to client. #11: scrapFilter whitelist added. #12: /api/ais no longer returns null array |
| 4 | OCEAN ENDEAVOUR LDT Fix | ✓ Complete | ldtRaw validation >= 500, DWT-to-LDT ratio by vessel type (passenger: 0.20, tanker: 0.18, other: 0.17) |
| 5 | Scrap Score Sync Check | ⚠ Partial | Worker (aisWorker.js) already saves scrap_score+scrap_category to DB in UPSERT. Worker uses its own computeScrapScore (factors navStatus, flag risk, speed+age) from builtYearEnrichment.js — more operational than scoring.ts. Cannot directly import TypeScript ESM from CJS worker. Both are valid but different scoring models. |
| 6 | Hero Page Stats | ✓ Complete | /api/stats route created (revalidate 1h). page.tsx updated with useEffect fetching real stats (totalVessels, critical, ownersFound), search box navigating to /map?search=X, and 3-stat strip below hero buttons |
| 7 | S&P Module Improvements | ✓ Complete | snp/route.ts now uses SCRAP_MARKETS prices (no more hardcoded 332). OCEAN ENDEAVOUR price uses Aliağa from SCRAP_MARKETS. Page already shows type code, DWT, LDT, tags. Empty state message "No vessels match" already present |
| 8 | Performance and Security | ✓ Complete | In-memory rate limiter added to /api/vessels (60 req/min per IP, 429 on exceeded). DB error messages sanitized across all API routes |
| 9 | Deploy Verify | ⚠ Skipped | curl checks require git push to complete first; all code changes are built and committed |
| 10 | Sprint Report | ✓ Complete | This document |

---

## Live System Status

- **Build**: ✓ Passing (Next.js 16.2.9 Turbopack, TypeScript clean)
- **AIS Worker**: Running on Render — polls every 45s, collects 30s window, upserts to Supabase
- **Scrap Markets**: Single source of truth at `src/lib/scrapMarkets.ts` — Alang $510, Chittagong $560, Gadani $500, Aliağa $420/LDT
- **API Stats**: `/api/stats` endpoint with 1h revalidation serving real Supabase counts
- **Rate Limiting**: 60 req/min/IP on `/api/vessels`

---

## Scrap Score Distribution (from DB — last known state)

The worker computes scrap scores using a multi-factor model:
- Age (dominant signal: 0–40 pts based on age brackets)
- Nav status: anchored (+15) / moored (+15)
- Risk flag (KM, TG, PW, etc.): +12
- Speed = 0 (stationary): +5

Categories:
- **critical**: score > 35
- **high**: score 25–35
- **medium**: score 15–24
- **low**: score < 15

---

## Owner DB Status

- Owners table populated by `worker/contactEnrichment.js` (daily scan)
- Contact data: department emails (S&P badge), generic emails (GENEL badge), guessed personal emails (TAHMİNİ badge)
- LinkedIn URLs stored per owner for S&P contact workflow
- Email format patterns stored for guessing manager emails

---

## Scrap Markets — Source of Truth

```typescript
// src/lib/scrapMarkets.ts
ALANG      India       $510/LDT
CHITTAGONG Bangladesh  $560/LDT
GADANI     Pakistan    $500/LDT
ALIAĞA     Turkey      $420/LDT
```

Used by: VesselPanel.tsx (per-market table + Est. Scrap Value row), Layout.tsx (ticker), snp/route.ts, alerts/route.ts.

---

## Technical Debt

1. **Scoring algorithm divergence**: Worker uses operational scoring (age + navStatus + flag + speed), scoring.ts uses age-only simplified model. Should unify into a shared JS/TS file compiled for both environments, or expose scoring.ts as a built JS module the worker can require.

2. **Rate limiting**: In-memory rate limiter resets on cold start. For production, should use Redis (already configured via `src/lib/redis.ts`).

3. **snp/route.ts**: Does not join with owners table for S&P listings. Manager name and contact emails would improve conversion. Requires DB query in the route.

4. **No auth**: All routes are public. Clerk or NextAuth integration needed for gated features (CRM, alerts, watchlist).

5. **Ticker delta values**: Layout.tsx ticker now shows empty delta (`""`) since SCRAP_MARKETS has no delta. Ticker should either fetch live prices or store static deltas alongside prices.

---

## Next Steps

### High Priority
- **Auth/Clerk**: Gate CRM, alerts, vessel watchlist behind login
- **Stripe**: Subscription for premium features (full owner contact data, export, bulk alerts)
- **More S&P listings**: Expand beyond 12 tracked IMOs — integrate GRS, Clarkson, BRS feeds

### Medium Priority
- **Map improvements**: Vessel search on map (/map?search=X routing from hero), filter persistence
- **Vessel compare**: Side-by-side scrap value, age, survey status for 2-4 vessels
- **Real-time scrap prices**: Integrate Platts or S&P Global price feed for live ticker deltas

### Low Priority
- **Redis rate limiting**: Replace in-memory rate limiter
- **Scoring unification**: Single scoring algorithm for worker + API
- **S&P owner join**: Join owners table in snp/route.ts for contact data in listings

---

*Generated: 2026-06-22 — ShipScout Sprint by Claude Sonnet 4.6*
