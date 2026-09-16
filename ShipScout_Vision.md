# ShipScout — Maritime Deal Intelligence

## What ShipScout Is

ShipScout is a Maritime Deal Intelligence platform that identifies vessels likely to transact before they officially reach the market.

The maritime asset transaction market — covering ship recycling, distressed sales, and judicial auctions — generates over $100 billion in annual transaction volume. It runs almost entirely on personal relationships, WhatsApp groups, and broker networks. No system currently answers the commercially critical question:

> *"What type of transaction is most likely to happen with this vessel, and who should I contact before the wider market knows?"*

ShipScout answers that question.

---

## The Opportunity

Maritime asset transactions are opaque by nature. When a vessel becomes available — through financial distress, survey pressure, detention history, or operational inactivity — the information reaches the market slowly and inefficiently. Brokers hear about it first. Cash buyers and investors hear about it last.

ShipScout inverts this.

By continuously monitoring over 15,000 vessels through AIS movement data, PSC inspection records, class and survey schedules, ownership structures, and maritime news, ShipScout surfaces transaction signals weeks or months before any broker lists a vessel publicly.

This is not a vessel database. It is a deal origination system.

---

## Three Verticals, One Intelligence Engine

ShipScout covers three closely connected opportunity types that share the same underlying data infrastructure:

**Recycling**
Vessels approaching the end of their trading life identified through age, lightweight tonnage, AIS inactivity, PSC detention history, survey schedules, flag risk, and current scrap yard prices across Chittagong, Alang, Gadani, and Aliağa. Scrap value is calculated directly: LDT × current $/LDT at selected yard.

**Distressed Sale**
Owners or vessels showing signs of motivated selling — prolonged lay-up, repeated detentions, approaching surveys, ownership changes, financial distress signals from maritime news — where a sale at below-market value becomes commercially rational before any official listing.

**Auctions and Arrests**
Vessel arrests, judicial sales, bank seizures, and auction calendars tracked in real time across UK Admiralty, Singapore Supreme Court, and other jurisdictions. Matched against the vessel database and owner contact records.

These are not three separate products. They run on the same intelligence engine:

**DISCOVER → ANALYZE → CONTACT → CLOSE**

A single vessel can represent multiple opportunity types simultaneously. ShipScout shows all of them.

---

## How the Intelligence Engine Works

**Signal Detection**
The system monitors vessel behavior continuously. When a 31-year-old bulk carrier goes idle for 64 days, receives two PSC detentions, and has a special survey approaching, the system detects the pattern automatically.

**Probability Scoring**
Each vessel receives a transaction probability score across opportunity types. The score is transparent and explainable — not a black box:

> *Recycling Probability: 87%*
> Age 31 years (weight 40%) + AIS idle 64 days (weight 30%) + 2 PSC detentions (weight 20%) + Special survey in 3 months (weight 10%)

> *Distressed Sale Probability: 72%*
> Lay-up duration + detention pattern + survey cost vs. estimated market value

> *Auction Probability: 15%*
> No arrest signals detected, owner contact verified

**Owner Contact**
Ownership data sourced from Equasis is enriched through website scraping, Hunter.io domain search, SMTP verification, and named contact extraction. The result is a verified, layered contact record: owner, manager, ISM manager, department emails, direct contacts with titles, LinkedIn profiles.

**AI Analysis**
Claude generates a plain-language brief for each vessel explaining why it is likely to transact, what the buyer's angle is, and what to say when reaching out. Outreach emails are drafted automatically, personalized to the vessel's specific situation and the recipient's name.

**News Matching**
Maritime RSS feeds, OFAC sanctions, judicial auction pages, and layup detection are scanned daily. Events are matched against the vessel database and classified by type. When a news event touches a vessel already in the system, it immediately updates that vessel's probability score and alerts active users.

---

## The User Experience

Users select their area of interest on entry:

**Recycling** — Scrap candidates ranked by opportunity score. LDT valuation at any of four major yards. Verified owner contact. Direct outreach in one click.

**Distressed Sale** — Motivated-seller signals, estimated market vs. scrap value gap, technical and commercial indicators, decision-maker contacts.

**Auctions** — Active arrests and judicial sales with vessel details, court jurisdiction, auction dates, and matched owner records.

The underlying vessel database, AIS intelligence, PSC records, ownership contacts, alerts, and deal workflow are shared across all three verticals.

---

## Revenue Model

**Subscription**
$500–2,000 per month per user depending on access tier. Maritime professionals already pay $10,000+ per year for Clarksons or VesselsValue. ShipScout is more targeted and delivers actionable deal flow, not general market data.

One deal sourced through ShipScout in a year justifies the subscription cost many times over for a cash buyer or distressed investor.

**Transaction Commission**
Users agree at signup that any vessel discovered through ShipScout which transacts within 18 months generates a 1% commission payable to ShipScout.

Enforcement is not primarily legal — it is structural. The platform retains deal flow, deal history, and contact records. Bypassing ShipScout means losing access to future early signals, losing platform reputation, and losing the deal workflow infrastructure. For buyers who return repeatedly for deal flow, the relationship cost of bypass exceeds the commission cost.

**Deal Workflow Infrastructure**
As the platform matures, deal activity increasingly lives inside ShipScout: platform-mediated first contact, LOI generation, deal tracking from Contacted through Negotiating to Closed. When the transaction infrastructure is on the platform, commission recognition is verifiable rather than honor-based.

---

## Defensibility

**Data moat.** The combination of AIS positioning, PSC inspection records, Equasis ownership, verified multi-layer contact enrichment, and maritime news classification took months to build. It cannot be replicated quickly.

**Early signal advantage.** If ShipScout surfaces a vessel 30 to 60 days before it reaches any broker's list, a user who bypasses loses first-mover access to future signals. The early information itself is the retention mechanism.

**Network effect.** As more buyers close deals through the platform, the reputation system strengthens. Verified deal history on a user profile has value. Bypass undermines that value.

**AI layer.** The probability scoring, vessel briefs, and outreach drafting are not features that can be added to a traditional vessel database. They require the combination of structured data, real-time AIS, news classification, and language model output working together.

---

## What ShipScout Is Not

ShipScout does not compete with general maritime information services. It does not cover crewing, bunkering, insurance, chartering, or port operations. It does not attempt to be a vessel database or a broker replacement.

ShipScout is focused on one thing:

**Asset transactions. Deal origination. Finding the vessel before the market does.**

---

## Positioning

**ShipScout — Maritime Deal Intelligence**

*Find vessels likely to transact — before they reach the market.*

---

## Current State

- AIS worker monitoring 15,000+ vessels continuously on Railway
- PSC detention data: 328 Paris MOU records imported, daily THETIS feed active
- OFAC sanctions: 1,512 vessel records
- Owner contact database: 430+ verified emails, 395 phones, 771 websites
- Opportunity Radar: real-time scoring with recycling probability, signal detection, verified contacts
- News Radar: daily maritime RSS classification via Claude Haiku, event-to-vessel matching
- Weekly digest: 32 editions, AI-generated editorial, public archive
- Scrap pricing: live $/LDT for Chittagong, Alang, Gadani, Aliağa
- AI outreach: Claude-generated cold emails per vessel, one click to send
- Distressed Fleet Watch: bank seizure, arrest, auction, bankruptcy tracking

The infrastructure is built. The intelligence engine is running. The next step is the first paying customer.
