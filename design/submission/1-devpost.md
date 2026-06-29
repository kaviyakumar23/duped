# Deliverable 1 — Devpost submission (paste-ready content + form guide)

> Sources: every number traces to `design/submission/FACTS.md` + the verified 10,000-attempt run (`scratchpad/storm10k.log`). Honest framing: these are *attempts*, almost all **rejected** — not commits. Paste prose as single lines (Devpost turns hard-wrapped markdown into mid-sentence breaks).

---

## Project name
**Duped**

## Elevator pitch (≤ ~200 chars — paste into the tagline field)
10,000 concurrent attacks hit one legendary sword across two regions — it stayed exactly one. Duped is an economy kernel that makes item & gold duplication unrepresentable in a game's authoritative state.

*(190 chars. Alt, shorter: "One legendary. 10,000 dupe attempts. Still exactly one. Duped makes item & gold duplication unrepresentable — on Aurora DSQL." — 122 chars.)*

---

## About the project  (paste into the long "About" field — Markdown supported)

## Inspiration
Dupe bugs have wrecked online-game economies for twenty-five years. Amazon's New World repeatedly froze all trading and gold transfers in 2021 to stop item and gold duplication; Diablo II's economy ran on dupes for years; RuneScape has rolled back its entire economy after dupe incidents. These are teams of hundreds, and they keep shipping the same bug. We kept asking why — and the answer is uncomfortable: a dupe is not a gameplay bug, it's a distributed-systems consistency bug. A trade-window race is a lost update. Drop-and-relog is a non-atomic transaction. A cross-region dupe is split-brain. So we stopped trying to *detect* duplication and asked a different question: what if the authoritative state simply had no way to *represent* an item being owned twice?

## What it does
Duped is an economy kernel a studio integrates so every item and coin is provably conserved — under concurrency, across regions. It protects two kinds of object two different ways, because a sword is not money. A unique item is exactly one row with one owner and a version; every trade, drop, pickup, or mail is the same conditional update that must match the item's current owner and version, so two concurrent transfers can never both win. Fungible gold is sharded balances that can't go negative plus a balanced double-entry ledger, so supply in always equals supply out. The live demo at the link below lets you *watch* this: run a trade race against a naive database and the one legendary duplicates into ~20 copies; run the exact same race through Duped and it stays exactly one. Then you can run the real invariant SQL yourself and watch it return count = 1, ledger drift = 0.

## How we built it
Aurora DSQL is the single source of truth. The whole guarantee lives in one statement — `UPDATE item_instances SET owner_id = :to, version = version + 1 WHERE instance_id = :id AND owner_id = :from AND version = :expected` — where a row count of 1 is required; two racing transfers can't both match, and DSQL's optimistic concurrency surfaces the loser as SQLSTATE 40001, which the kernel retries with the same idempotency key. Every economic action goes through one function, `executeTrade`, which does the version-guarded item moves, the sharded conditional gold debit/credit, the balanced ledger, an idempotency-registry write for exactly-once, and a transactional-outbox event — all in a single DSQL transaction. A projector drains that outbox into DynamoDB, which powers the live "world" read model (the settlement feed and projections). The front end is Next.js on Vercel; auth to AWS is IAM/OIDC federation, so there are no passwords in code. DSQL has no foreign keys and builds indexes asynchronously, so integrity lives in the service layer plus audit queries, and money is always BIGINT minor units.

## Challenges we ran into
Aurora DSQL is PostgreSQL-compatible but not PostgreSQL: no foreign keys, one DDL statement per transaction, and indexes built asynchronously — so we gate traffic until the unique idempotency indexes are ACTIVE. We hit a real table-name collision running in a shared DSQL database and had to isolate our tables (`idempotency_registry` and `event_outbox` became `trade_idempotency` and `world_outbox`) so a seed could never wipe a neighbor's data. We caught a nasty concurrency bug in our own kernel — a trade id briefly held in module scope instead of per-attempt, which under massive concurrency would corrupt everything — and fixed it to a strictly local value. Making the cloud demo self-sufficient meant replacing a background worker with project-on-read (the snapshot drains a batch of the outbox on each read), so the live feed populates with no cron and no laptop. And to make the contrast beat honest, we had to build a *deliberately broken* model that genuinely duplicates the item under a real race — then prove the same race does nothing to the real kernel.

## Accomplishments that we're proud of
The numbers are measured, not claimed. A 10,000-attempt dupe storm against the single legendary blocked 9,992 attempts, settled 8 legitimate transfers, surfaced 632 optimistic-concurrency retries, and finished with the legendary count at exactly 1 and zero errors. On a real peered Aurora DSQL cluster spanning Tokyo (ap-northeast-1) and Seoul (ap-northeast-2), 482 of 482 simultaneous cross-region grabs of the same item were blocked — the hardest dupe, gone. A 1,000-transfer gold double-spend left supply unchanged at 600,000 minor units (conserved to the unit). Independent marketplace trades scaled linearly — 42, 103, 204, then 383 trades per second at 10, 25, 50, 100 concurrency, with zero contention. Twelve unit tests pass and CI is green, and `pnpm reconcile` reports every critical invariant holding: legendary count = 1, no instance owned twice, gold supply = minted, ledger drift = 0.

## What we learned
The cleanest correctness guarantees aren't checks you run — they're shapes you give the data, so the bad state can't be written down. We also learned that one contested item is *supposed* to be serial: that single hot row is exactly why duplication is impossible, while a million players trading their own items are a million independent rows that scale out. Aurora DSQL's active-active model turned the scariest case — a cross-region dupe — into the easiest, because both regions serialize against one logical database. And we learned to say the quiet part out loud: the guarantees hold as long as every economic action goes through the kernel.

## What's next
Wider multi-region topologies and a measured failover story; a thin client SDK so a studio can route trades, drops, mail, and auction settlements through the kernel in an afternoon; and leaning into the honest positioning — Duped is the economy *settlement* layer (trades, marketplaces, cross-region transfers), not the real-time combat loop. The bigger the virtual economy and the realer the money behind the items, the more this matters.

---

## Built with  (tags — add via the autocomplete dropdown; the tokenizer splits on spaces)
`Amazon Aurora DSQL` · `Amazon DynamoDB` · `Vercel` · `Next.js` · `React` · `TypeScript` · `Node.js` · `PostgreSQL` · `pnpm` · `Vitest` · `GitHub Actions`

## Try it
- **Live demo:** https://duped-two.vercel.app
- **Repo:** https://github.com/kaviyakumar23/duped  *(make public before submitting)*
- **Public proof endpoint:** `curl -s https://duped-two.vercel.app/api/world/proof`

---

## Testing instructions for judges (no login, ~90 seconds)
1. Open **https://duped-two.vercel.app** and read the one-screen pitch, then click **Try the live demo** (or go to `/try`).
2. In **"Same attack. Two databases."**, click **Run the trade race** on the NAIVE side — the one legendary duplicates to ~20 copies (real rows). Then click **Run the SAME race** on the DUPED side — it stays **× 1**.
3. Click **Unleash dupe storm** — thousands of attacks; watch DUPE ATTEMPTS BLOCKED climb and the count hold at **× 1**.
4. Click **Run SQL proof** — the modal runs the real queries against Aurora DSQL: `legendary count = 1`, `ledger drift = 0`, every invariant PASS.
5. (Optional) Click **Gold double-spend** (supply conserved), **Market storm** (throughput climbs), **Failover region**, and **Trace this legendary's history** (full ownership chain, never two at once).
6. Click **Reset world** to return to a clean state. Or verify headless: `curl -s https://duped-two.vercel.app/api/world/proof` → `"allPass": true`.

---

## FIELD-BY-FIELD FORM GUIDE  (H0 / Devpost)

The form is **multi-page**: *Project overview → Project details → Additional info → Submit*. **Save each page as a draft** as you go (partial saves work even with a required field empty). **Leave the final Submit to yourself, with a time buffer.**

**Page 1 — Project overview**
- **Project name:** `Duped`
- **Tagline / "What's your idea?" (elevator pitch):** paste the 190-char pitch above.
- **"Built with":** add each tag from the list above **via the autocomplete dropdown**. The tokenizer splits multi-word terms on spaces, so after adding, **review the tag chips and delete any junk fragments** (e.g. a stray "DSQL" or "Aurora" chip). Prefer the official entries: "Amazon Aurora DSQL", "Amazon DynamoDB".
- **"Try it out" links:** Live = `https://duped-two.vercel.app` ; Source = `https://github.com/kaviyakumar23/duped`.

**Page 2 — Project details**
- **About / long description:** paste the entire "About the project" section above. **Paste it so each paragraph is a single line** (it already is) — hard-wrapped markdown becomes mid-sentence breaks on Devpost.
- **Image gallery / thumbnail:** **[USER — upload]** screenshots (suggest: the `/try` contrast at ×20 vs ×1; the SQL-proof modal; the landing hero). Set the contrast screenshot as the thumbnail.
- **Demo video link:** **[USER — paste after YouTube upload]** (must be public, < 3:00).

**Page 3 — Additional info (hackathon-specific)**
- **AWS database(s) used:** select/enter **Amazon Aurora DSQL** (primary) and **Amazon DynamoDB**.
- **Track / category:** **Track 3 — Million-Scale Global App**. For any native `<select>` dropdown: click it, press **Escape** (do NOT press Enter — Enter submits the page), then **type the option name** (typeahead) or click the option directly.
- **Vercel Team ID:** `team_jBpMjbUf4sAswZ9CSak3WGIl` — **[USER CONFIRM]**.
- **Architecture diagram:** **[USER — upload]** `design/submission/architecture.svg` (export to PNG if SVG is rejected).
- **AWS proof screenshot:** **[USER — upload]** a screenshot showing the Aurora DSQL cluster **and** the DynamoDB table in the AWS console.
- **Country of Residence:** **[USER ONLY]**.
- **Submitter Type:** **[USER ONLY]** (personal / individual).

**Page 4 — Submit**
- Confirm everything saved; verify the live link opens in **incognito** (no login wall). **You** click Submit — not the assistant — with buffer before the deadline.
