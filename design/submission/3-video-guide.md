# Deliverable 3 — Demo Video Production Guide (< 3:00)

Record against the **live** site: https://duped-two.vercel.app. Every number below is from `FACTS.md` (measured). Honest framing: say **"attempts," almost all rejected** — never "commits."

> **Before you record:** open https://duped-two.vercel.app/try in an incognito window and click **Reset world** so you start pristine (legendary with Aurelia_Vale, gold whole, legacy ×1). Do a dry run of every click once — buttons trigger real storms and take a few seconds.

---

## 1. The 8-segment arc (first 30s must show: category = game economies · product = Duped · hero tech = Aurora DSQL)

| # | Segment | ~Time | Beat |
|---|---|---|---|
| 1 | **Problem** | 0:00–0:24 | Dupes have wrecked game economies for 25 years; it's a consistency bug; meet Duped on Aurora DSQL. |
| 2 | **Live proof (the contrast)** ★ | 0:24–0:52 | Same attack, two databases: naive dupes to ~20; Duped stays ×1. |
| 3 | **Scale proof** | 0:52–1:12 | Independent trades scale 42→383 trades/sec, 0 contention. |
| 4 | **Interactive proof** | 1:12–1:36 | It's live — dupe storm (all rejected, count=1) + gold double-spend (conserved). |
| 5 | **Data / SQL proof** ★ | 1:36–1:58 | Run the live SQL: count=1, gold=minted, ledger drift=0. |
| 6 | **Why this platform (cross-region)** ★ | 1:58–2:24 | Active-active Tokyo⇄Seoul; 482/482 cross-region grabs blocked. |
| 7 | **It's a real product** | 2:24–2:42 | Landing + docs + public API + green CI, deployed on Vercel. |
| 8 | **Close** | 2:42–2:58 | "The authoritative state has no way to represent a dupe." |

---

## 2. ElevenLabs VO script (spoken lines only — paste this in)

> First-person, conversational, unhurried-but-not-slow. Per-segment word counts + running time at ~0.95× (~145 wpm). **Total ≈ 362 words ≈ 2:48 with pauses.**

**[SEG 1 · ~0:24 · 62 words]**
For twenty-five years, online games have shipped the same bug. <break time="0.5s"/> A dupe. One legendary item becomes two. Gold gets spent twice, and the economy collapses. New World froze trading over it; Diablo Two and RuneScape ran on it for years. <break time="0.5s"/> It's not bad luck — it's a database consistency bug. So I built Duped: an economy kernel on Aurora DSQL that makes duplication unrepresentable.

**[SEG 2 · ~0:28 · 62 words]**
Here's the same attack against two databases. <break time="0.5s"/> On the left, a naive design with no version guard. I run a trade race — and watch. The one legendary duplicates into about twenty copies. Real rows, real SQL. <break time="0.7s"/> On the right is Duped. The exact same race. <break time="0.5s"/> It stays at one. Not blocked after the fact — it was never even representable.

**[SEG 3 · ~0:20 · 40 words]**
And it scales. <break time="0.5s"/> One contested item is serial by design — that's exactly why it can't dupe. But independent trades run in parallel: throughput climbs from forty-two to three hundred eighty-three trades a second, with zero contention.

**[SEG 4 · ~0:24 · 46 words]**
And this is all live — you can click it yourself. <break time="0.5s"/> Ten thousand concurrent dupe attempts on the legendary — nearly all rejected, the count never leaves one. Thousands of spends from the whale: gold in equals gold out. Every attempt hits the real kernel.

**[SEG 5 · ~0:22 · 40 words]**
Don't take my word for it — run the SQL. <break time="0.5s"/> Live, against the truth core: legendary count, one. Gold supply equals minted. Ledger drift, zero. Every transaction balanced. <break time="0.5s"/> The guarantee isn't a promise. It's a property you can query.

**[SEG 6 · ~0:26 · 52 words]**
And here's why Aurora DSQL. <break time="0.5s"/> The hardest dupe is cross-region — the same item traded in two places at once. But Tokyo and Seoul are one logical database, active-active, strongly consistent. I fired four hundred eighty-two simultaneous cross-region grabs on the real peered cluster. <break time="0.5s"/> Every single one blocked. One winner, globally.

**[SEG 7 · ~0:18 · 32 words]**
And this isn't a toy. <break time="0.5s"/> There's a landing page, real docs with a public API, green CI — and it's deployed and running on Vercel right now.

**[SEG 8 · ~0:16 · 28 words]**
Dupe bugs have plagued games for twenty-five years. <break time="0.5s"/> Duped doesn't patch them. The authoritative state simply has no way to represent one. <break time="0.7s"/> That's Duped.

> **[VERIFIED]** The 10,000-attempt run completed: 10,000 attempts → **9,992 rejected**, 8 legitimate transfers settled (one per wave), **count = 1**, 632 OCC retries, **0 errors**. Keep "ten thousand … nearly all rejected" (not "every one" — 8 legit transfers do settle). On screen you'll click **Unleash dupe storm** (clamped to ~600 attempts live — same result, count stays 1); match the burn-in caption to the number actually shown, or screen-record the CLI 10k run for the bigger figure.

---

## 3. Shot list (what to screen-record per segment + burn-in caption)

| Seg | Record this | Burn-in caption |
|---|---|---|
| 1 | Landing `/` slow scroll: hero "Duplication, made unrepresentable" + the gold ×1, then the "A dupe bug is counterfeiting" cards (New World / Diablo II / RuneScape). | `DUPES HAVE WRECKED GAME ECONOMIES FOR 25 YEARS` |
| 2 ★ | `/try` top **"Same attack. Two databases."** Click **Run the trade race** (left) → left count animates to **×~20 red, "DUPLICATED"**. Then click **Run the SAME race** (right) → right holds **×1 gold**. Let both states sit on screen together. | `SAME RACE · NAIVE DB DUPES · DUPED STAYS ×1` |
| 3 | `/try` Million-scale panel: click **Show scaling chart**; cursor traces the curve **42 → 103 → 204 → 383 trades/sec**. Then click **Market storm**; the live tps readout fills in. | `INDEPENDENT TRADES SCALE OUT · 0 CONTENTION` |
| 4 | `/try` Control bar: click **Unleash dupe storm** → arena swarms, toast shows attempts blocked, the big **× 1** never changes. Then **Gold double-spend** → gold particles flow, toast "supply before == after." | `10,000 ATTEMPTS · ALL REJECTED · STILL × 1` |
| 5 ★ | `/try` click **Run SQL proof** → modal opens; scroll the invariants showing each query + `legendary count = 1`, `gold supply = minted`, `ledger drift = 0`, all green PASS. *(Optional cutaway: a terminal running `pnpm reconcile` ending in "ALL CRITICAL INVARIANTS HOLD" — see asciinema note.)* | `RUN THE PROOF YOURSELF · LIVE SQL` |
| 6 ★ | `/try` **Cross-region Defense** section: the Tokyo (ap-northeast-1) ⇄ Seoul (ap-northeast-2) nodes, then the big **482 / 482** stat "CROSS-REGION GRABS BLOCKED." Optionally click **Failover region** and show trades still settling. | `TOKYO ⇄ SEOUL · ONE LOGICAL DB · 482/482 BLOCKED` |
| 7 | Quick montage: `/docs` sidebar + the `POST /api/v1/trades` API table; the GitHub repo's **green CI check**; the Vercel URL in the address bar. | `LANDING · DOCS · PUBLIC API · GREEN CI · ON VERCEL` |
| 8 | Back to `/try` arena, calm, the glowing **× 1**; fade to the DUPED wordmark. | `THE STATE HAS NO WAY TO REPRESENT A DUPE` |

---

## 4. The 2–3 money shots — nail these over everything else

1. **The contrast (SEG 2):** ×~20 red on the left next to ×1 gold on the right, both on screen at once. This single frame is the whole pitch. Re-record until the animation is crisp and both numbers are legible.
2. **The SQL proof modal (SEG 5):** the literal query next to `= 1` / drift `= 0`. This is what converts "claim" into "proof."
3. **482 / 482 cross-region (SEG 6):** the one stat that justifies Aurora DSQL specifically.

If you're short on time, get these three perfect and let the rest be one clean take.

---

## 5. Tools — step by step

### Screen Studio (record · Mac)
1. New Recording → record the **browser window** (not full screen). Display at 1920×1080; hide bookmarks bar.
2. Settings: motion blur **on**, automatic zoom **on** (it auto-pushes into clicks — great for the ×1 and the proof modal), cursor size **medium**, click highlights **on**.
3. Record each segment as its **own clip** (stop/start) so a fumbled click only costs one segment. Do the contrast (SEG 2) 2–3 times and keep the best.
4. Export **1080p, 60fps, ProRes or high-bitrate MP4**.

### ElevenLabs (voice)
1. Paste each segment (with the `<break>` tags) into Text-to-Speech.
2. Voice: **see §6**. Generate per segment so you can re-roll a bad line cheaply.
3. Download MP3s named `seg1.mp3 … seg8.mp3`.

### CapCut (assemble)
1. Drop the 8 VO clips on the audio track in order; lay each screen-recording above its VO and trim the visual to match the line length.
2. Add the **burn-in captions** (large, bottom third, mono font, 1 per segment).
3. Add a quiet ambient/synth soundbed at **~-22 dB** under the VO (no drops, no big swells — flat bed).
4. Use small cross-zooms/cuts between segments; keep cuts on the VO `<break>` beats.
5. Export **1080p MP4**. Confirm total **< 3:00**. Save a copy locally = your **backup recording**.

### YouTube (host — PUBLIC)
1. Upload, visibility **Public** (NOT unlisted — the rules require public).
2. **Title:** `Duped — making item dupes unrepresentable on Aurora DSQL (H0 Hackathon)`
3. **Description** (paste; chapters auto-link):
   ```
   Duped is a globally consistent economy kernel for online games. It makes item & gold
   duplication unrepresentable in a game's authoritative state — on Aurora DSQL + DynamoDB,
   deployed on Vercel. Built for the H0 Hackathon (Track 3: Million-Scale Global App).
   Try it: https://duped-two.vercel.app   Code: https://github.com/kaviyakumar23/duped

   00:00 The 25-year dupe bug
   00:24 Same attack, two databases
   00:52 Scaling out
   01:12 Live — try it yourself
   01:36 Run the SQL proof
   01:58 Cross-region on Aurora DSQL
   02:24 A real product
   02:42 Close

   #H0Hackathon
   ```
4. Copy the link → paste into the **Devpost "Video" field**.

### (Optional) asciinema for SEG 5
`asciinema rec proof.cast` → run `pnpm reconcile` → exit → convert to GIF with `agg proof.cast proof.gif`. Use as a 3-second cutaway over SEG 5 if you want a terminal beat alongside the in-app modal.

---

## 6. Voice recommendation (this is the #1 AI tell — get it right)

- Use an ElevenLabs **Default** voice (the curated set), **not** a community-Library voice. Pick a **natural, conversational American** voice — think "a founder explaining their project," not a movie-trailer announcer. Flat, even, perfectly-paced delivery is the dead giveaway that it's synthetic.
- Settings: **Stability ~45 · Similarity ~80 · Style ~15 · Speed ~0.95× · model Multilingual v2.**
- **Lower Stability = more human** (more natural variation). If a line sounds robotic, drop Stability toward 40 and re-roll.
- **Audition by ear on the hardest line** — SEG 6 ("four hundred eighty-two simultaneous cross-region grabs…") has the most numbers and is where a robotic voice falls apart. Pick the voice that nails that line, then use it for all eight.
- Listen for mispronunciations: "DSQL" (say "D-S-Q-L"), "ap-northeast" — if mangled, spell phonetically in the text for that take.
