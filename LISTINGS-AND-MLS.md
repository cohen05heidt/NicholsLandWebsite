# How Nichols lists properties on the new site

Prepared August 2026. Two parts: **what's wrong with their listing data today**, and **how the office should be adding listings going forward**.

---

## Part 1 — Listing errors found

Their own website disagrees with the listings they've syndicated to LandSearch, Land.com and Homes.com. Four items need the client to confirm which version is correct.

| # | Tract | nicholsland.net says | Syndicated feeds say | What to ask |
|---|---|---|---|---|
| 1 | **Jabez Poyner Road**, 73.59± ac, Oglethorpe | No price. The page shows the Poplar Street description by mistake — 2.5 acres, $149,500, Monroe directions | **$375,000** | Confirm the price, and rewrite the overview. The current copy describes a different property entirely. |
| 2 | **Wilson Lane**, 67.63 ac, Oglethorpe | No price | **$845,500** | Confirm. That's about $12,500/acre against roughly $3,500–6,000/acre on their comparable tracts, so it may be a data-entry error somewhere. |
| 3 | **Brewer's Bridge Tract 2**, 37.75± ac, Elbert | Listed as available, $208,000 | **Under contract** | If it's under contract, the website is advertising a tract they can't sell. |
| 4 | **Bridges Road Tract 1**, 60 ac, Oglethorpe | $353,000 | $353,000, after a **$64,000 reduction in June** | Price agrees. Noted only because the reduction never appeared on their own site as a "Reduced" flag. |

Also unresolved: **Lumber City Tract** (377 ac, Wheeler County) shows no price on either.

The new site currently carries "Call for Price" for items 1, 2 and Lumber City rather than publishing numbers I couldn't verify. Update `data/properties.json` once the client confirms.

**None of this is carelessness.** It's the predictable result of maintaining listings in two places by hand. Which leads to part two.

---

## Part 2 — They're already in the MLS

This is the important finding. Nichols Land & Investment is a **Georgia MLS member office**, listed under office code `NICH01`. Evidence:

- A Georgia MLS office page exists for them
- Their listings appear on LandSearch, Land.com, LoopNet and Homes.com — syndication that flows from an MLS feed
- Stephen Davison shows 14 listings on LandSearch
- Their own photo filenames read `web-or-mls-25.jpg` — they produce MLS-ready photo sets as standard practice

**So the office is already doing the data entry. It just isn't reaching their own website.**

That reframes the problem. The question isn't "how do we let them add listings?" — it's "why are they typing every listing twice?"

---

## The recommendation: pull from the MLS feed

Georgia MLS licenses listing data directly to approved vendors. Because this site is static and reads from a single JSON file, the integration is unusually clean: **a scheduled script pulls the feed each night and regenerates `data/properties.json`.** The site itself doesn't change at all.

What that gets them:

- Listings appear on the website the same day they're entered into the MLS
- Status changes — under contract, sold, price reductions — happen automatically
- Photos come down with the feed, so no separate upload step
- Nobody types anything twice, and the errors in Part 1 stop happening

### What it costs

| Item | Cost |
|---|---|
| Georgia MLS standard data feed (public display) | **$100/month** |
| Georgia MLS back-office feed (internal only, not for public sites) | $50/month |
| Adding the brokerage as a client of an approved vendor | No additional fee |
| IDX plugin subscription | **$0 — not needed** |

That last row is the reason this approach suits them. Off-the-shelf IDX plugins run [$60–$149/month for IDX Broker](https://www.pinova.in/blog/idx-broker-pricing-2026-alternatives), about $95/month for Showcase IDX, and they're built for WordPress. This site is static, so the plugin layer is redundant — a sync script replaces it. **Roughly $100/month all-in rather than $160–250.**

### What it requires

1. **A Data License Agreement with Georgia MLS.** The vendor completes it as licensee; the brokerage completes the office information and signature section. Emailed to `IDX@gamls.com`.
2. **At least one GAMLS member office as a client** — Nichols is that office.
3. **Broker authorisation.** Carl Nichols, as broker, signs. Nothing proceeds without him.
4. **A technical note:** RETS was deprecated by RESO in 2018. Build against the **RESO Web API** (REST/JSON) rather than RETS, or the integration is legacy on day one.

### The catch worth raising with the client

Land brokers routinely keep tracts **off-MLS** — pocket listings, exclusive arrangements, sellers who don't want a public listing. Their own site's copy leans into this: *"A lot of our land never hits the market."*

So an MLS feed alone will not carry everything. The site needs **both**: feed-driven listings for MLS tracts, plus a small manual path for off-MLS ones. That's straightforward — the sync script writes MLS listings and leaves manually-added records untouched.

---

## If IDX is rejected or delayed

If the client won't authorise the feed, or it takes months, the fallback is **Airtable as a back office**:

- The office enters listings in a grid that behaves like a spreadsheet
- Photos and PDF maps attach directly to each record
- The site reads from Airtable via a build step, keeping the API key off the public site
- Free tier covers this volume; an administrator can use it on day one

It's genuinely easy. It just doesn't solve the double-entry problem, so the errors in Part 1 will recur.

---

## Suggested order

1. **Confirm the four listing discrepancies** with the client — do this regardless, it's live-site accuracy
2. **Ask whether Carl will authorise a Georgia MLS data feed** — this is the fork in the road
3. If yes → Data License Agreement, then I build the sync script and a manual path for off-MLS tracts
4. If no → build the Airtable back office instead

---

**Sources**

- [Georgia MLS — RETS FAQ and vendor requirements](https://www.gamls.com/vendors/retsfaq)
- [Georgia MLS — Listing Data Distribution](https://www.gamls.com/membership/listingdata)
- [Georgia MLS office record, NICH01](https://www.georgiamls.com/real-estate-offices/NICH01)
- [Nichols Land & Investment on LandSearch](https://www.landsearch.com/agents/nichols-land-and-investment/432445)
- [Nichols Land & Investment on Land.com](https://www.land.com/member/garrett-williams/6606/listings/)
- [IDX Broker pricing, 2026](https://www.pinova.in/blog/idx-broker-pricing-2026-alternatives)
- [RETS, RESO Web API and IDX explained](https://mlsimport.com/what-are-idx-mls-rets-and-reso-api/)
