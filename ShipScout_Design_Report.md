# ShipScout Design Sprint Report
**Date:** 2026-06-22  
**Sprint:** Premium Maritime UI

---

## Completed Design Changes

### ✓ Task 1 — Nav Bar Premium
- bg #0B1E3D navy, white text
- "Ship" white / "Scout" gold #C9A84C
- Active link: white + gold bottom underline
- "Sign in" (transparent/white border) + "Get Access" (gold bg, navy text) auth placeholder buttons
- Height 64px, border-bottom rgba(255,255,255,0.1)
- "Live · X vessels" badge: gold

### ✓ Task 2 — Ticker Strip
- Delta values restored: Alang −3, Chittagong +8, Gadani +2, Aliağa +4
- SCRAP_MARKETS import (single source of truth — prices from src/lib/scrapMarkets.ts)
- "Updated 2h ago" label on right

### ✓ Task 3 — Hero Two-Column Premium Redesign
- Left column: "LIVE AIS TRACKING" gold-border badge, 52px H1 with "Platform" in gold, search box (full-width with navy Search button), 4 stats from /api/stats (Vessels Tracked, Owners Found, Countries, 24/7 AIS)
- Right column: featured vessel card — shows first vessel from /api/vessels?list=1 (highest scrap_score), category badge, DWT/type/flag grid, est. scrap value in gold, "View Details →" gold button
- Dot-grid texture + navy radial gradient
- Responsive: hero-right hidden on <900px

### ✓ Task 4 — Vessel Card Hover Effects
- .vessel-card CSS class → gold border + slight lift on hover
- Removed inline onMouseEnter/Leave handlers from vessel cards

### ✓ Task 5 — Map Panel (Verified)
- "Full detail JSON →" button already removed ✓
- "Owner bilgisi toplanıyor — yarın güncellenir" message already present ✓
- No changes needed

### ✓ Task 6 — S&P Listing Cards
- .snp-card hover class (gold border)
- Type code box: category-tinted (red bg for critical, amber for high, gray for others)
- Category label shown below type code for critical/high vessels

### ✓ Task 7 — Compare Page (NEW — /compare)
- Search by vessel name, IMO or MMSI
- Fetches from /api/vessels?list=1 and filters client-side
- Add up to 4 vessels, remove individually
- Side-by-side comparison table: Type, Flag, Built, DWT, LDT, Scrap Score, Category, Est. Value (gold), Manager
- "Export PDF — coming soon" placeholder
- "Compare" link added to nav

### ✓ Task 8 — globals.css Polish
- .vessel-card: gold border + translateY(-1px) on hover
- .snp-card: gold border on hover
- .skeleton: shimmer animation for loading states
- @media (max-width: 900px): .hero-right hidden

---

## Pages Updated
| File | Changes |
|------|---------|
| src/components/Layout.tsx | Nav premium + Compare nav link + ticker deltas |
| src/app/page.tsx | Hero two-column redesign + vessel card class |
| src/app/snp/page.tsx | Category-colored type badges + .snp-card class |
| src/app/compare/page.tsx | NEW page |
| src/app/globals.css | Hover classes, skeleton, responsive |

---

## Screenshots Needed
- Homepage hero (desktop 1440px) — two-column layout
- Homepage hero (mobile 375px) — single column (hero-right hidden)
- Featured vessel card on hero right
- S&P listings with category-colored type badges
- Compare page with 2 vessels loaded side-by-side
- Nav bar (gold Scout, auth buttons)

---

## Next Design Steps
1. **Dark/light mode toggle** — CSS variables in globals.css make this straightforward
2. **Mobile hamburger nav** — current nav breaks on <768px
3. **Vessel photos** — Datalastic photo API integration (gradient placeholders currently)
4. **AIS pulse animation** — map marker pulse on position update
5. **Watchlist heart button** — on vessel cards for quick add to watchlist
6. **Vessel detail modal** — full-screen overlay instead of side panel on mobile

---

## Technical Debt
- Ticker deltas are still hardcoded (no live scrap price feed)
- Stats skeleton loading state not implemented (shows "—" while loading)
- Mobile nav not tested
- Vessel card inline onMouseEnter still present in some edge cases
- S&P page tab bar has Distressed/Voluntary only (Bank Repo/Judicial hidden — correct, no fake data)
- VesselPanel still uses dark theme (navy) while rest of site is light — consider unifying
