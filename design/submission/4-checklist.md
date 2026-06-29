# Deliverable 4 — "Did I miss anything?" submission checklist

Legend: ✅ **DONE** · ⏳ **TODO** (Claude can do) · 👤 **USER** (only you can do)

> ⏰ **Today is 2026-06-29 — the H0 deadline is almost certainly TODAY.** Confirm the exact time + timezone on https://h01.devpost.com and work backward with a **≥60-min buffer**. Save every Devpost page as a draft as you go; leave the final **Submit** for last.

## Required artifacts

| # | Requirement | Status | Where / note |
|---|---|---|---|
| 1 | Text description naming the required AWS DB(s) — **Aurora DSQL** + **DynamoDB** | ✅ DONE / 👤 paste | Copy from `design/submission/1-devpost.md` (Elevator pitch + "About the project"). You paste into Devpost. |
| 2 | Demo video **< 3:00**, **PUBLIC on YouTube**, first 30s shows category + product + the hero tech | 👤 USER | Record + voice + upload using `design/submission/3-video-guide.md`. Then paste the YouTube URL into Devpost. **Biggest blocker.** |
| 3 | Published live project link that works **in incognito** (no login wall) | ✅ DONE / 👤 re-test | https://duped-two.vercel.app — verified HTTP 200 on `/`, `/try`, `/docs`. **Re-open in a private window** to be 100% sure no Vercel auth wall returns. |
| 4 | Vercel **Team ID** | ✅ DONE / 👤 confirm | `team_jBpMjbUf4sAswZ9CSak3WGIl` — paste it; confirm it's the team that owns the deployment. |
| 5 | **Architecture diagram** file | ✅ DONE / 👤 upload | `design/submission/architecture.svg`. Open in a browser and **export/screenshot to PNG** (Devpost prefers raster) before uploading. |
| 6 | **Proof-of-tech screenshot** (AWS console) | 👤 USER | Screenshot the **Aurora DSQL cluster** + the **DynamoDB `duped` table** in the AWS console (region ap-south-1; DSQL clusters also in ap-northeast-1/2). Required to prove DB usage. |
| 7 | Correct **track** + **primary AWS DB** selection | ✅ guidance / 👤 select | Track **3 — Million-Scale Global App**; primary DB **Aurora DSQL**. Exact dropdown steps in `1-devpost.md` form guide. |
| 8 | ≥1 **bonus content** piece (#H0Hackathon + "made for this hackathon" line), +0.2 each (max +0.6) | ✅ draft / 👤 publish | Draft in `design/submission/2-blog-post.md`. Do a voice pass, then publish (dev.to / LinkedIn / builder.aws.com). **Free points — do it.** |
| 9 | **Backup** local screen recording saved | 👤 USER | Keep a local copy of the demo recording in case the live site hiccups during judging. |
| 10 | **Repo public** | 👤 USER | github.com/kaviyakumar23/duped is **private**. Make it public so judges see the code + the green CI badge. (Or confirm you intend to keep it private and rely on the live URL.) |
| 11 | All Devpost pages saved as **draft**; final **Submit** by you | 👤 USER | Partial saves work even with empty required fields. Submit last, with buffer. |

## Already-strong signals (no action needed)
- ✅ Live, public, self-sufficient deployment (project-on-read feed; no worker needed).
- ✅ **CI green** (GitHub Actions: typecheck + 12 unit tests + build) — badge in README (visible once repo is public).
- ✅ Reproducible "wow": dupe storm (count stays 1), **482/482** cross-region grabs blocked, gold conserved, **42→383 trades/sec**, the naive-vs-Duped contrast, the live SQL proof — all in `FACTS.md`.
- ✅ Honest scope stated ("as long as every economic action goes through the kernel") — reads as rigor.

## What's still blocking submission — priority order (today)
1. **Record + upload the demo video** (`3-video-guide.md`) → it's required, it's where most judging happens, and it's the longest task. *Start here.*
2. **Make the GitHub repo public** → 1 click; unlocks code + CI badge for technical judges.
3. **AWS console screenshot** (DSQL + DynamoDB) → required proof-of-tech; 2 minutes.
4. **Fill + save the Devpost draft** (paste from `1-devpost.md`; Claude can drive the browser once you give the draft URL — Claude stops before Submit) → enter your Country/Submitter Type + upload the diagram, screenshot, gallery, and video link.
5. **Publish the blog post** (`2-blog-post.md`) with #H0Hackathon → free +0.2–0.6 bonus.
6. **Re-test the live URL in incognito**, save backup recording, then **Submit** with buffer.
