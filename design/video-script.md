# Duped — Demo Video Script (< 3:00)

Narration + on-screen. Keep it under three minutes; judges aren't required to watch past 3:00.

---

**[0:00 — black, then the world fades in]**
> "For twenty-five years, online games have shipped the same bug. A dupe. One legendary becomes two. The economy collapses. Amazon's *New World* froze trading to fight it. Diablo II and RuneScape ran on it for years."

**[0:12 — the arena: one glowing legendary, Tokyo + Seoul nodes, the whale]**
> "It's not bad luck. It's a distributed-systems consistency bug. So we built **Duped** — an economy kernel that makes duplication *unrepresentable* in a game's authoritative state, on Aurora DSQL."

**[0:25 — point at the calm "× 1 / ONE LEGENDARY"]**
> "This is Aetheria. One legendary blade. One whale with six thousand gold. Two regions — Tokyo and Seoul."

**[0:35 — click "Unleash dupe storm"; bots swarm, deflect off the shield]**
> "Now ten thousand bots attack that one sword at once — trade races, drop-and-relog, cross-region grabs. Every attack hits the real kernel."

**[0:55 — the toast lands; numbers settle]**
> "Look: a handful of legitimate trades settle. Thousands of duplication attempts — *blocked*. You can see the optimistic-concurrency retries. And the count?"

**[1:10 — zoom the × 1]**
> "Still one. Because a unique item is one row with one owner and a version guard. Two transfers can't both match it. 'Owned twice' has nowhere to live."

**[1:25 — click "Gold double-spend"; gold flows whale→treasury]**
> "Same for gold. Ten thousand concurrent spends from the whale. Sharded conditional debits, a balanced double-entry ledger."

**[1:40 — toast: supply before == after]**
> "Supply in equals supply out. Zero inflation. No coins conjured."

**[1:50 — click "Failover region" mid-storm]**
> "Drop a whole region mid-attack. Tokyo and Seoul are one logical database, strongly consistent. Trades keep settling on the survivor —"

**[2:05 — the count, still 1]**
> "— and still, exactly one legendary. We proved this on the real peered cluster: four hundred eighty-two simultaneous cross-region grabs, every one blocked."

**[2:20 — click "Run SQL proof"; the modal shows literal queries]**
> "And here's the proof — live SQL against the truth core. Legendary count: one. Gold supply: equals minted. Ledger drift: zero. Every transaction balanced."

**[2:40 — back to the calm world]**
> "Aurora DSQL is the truth core. DynamoDB powers this live world you're watching. Deployed on Vercel."

**[2:48 — the line]**
> "Duplication isn't patched here. The authoritative state has no way to represent it. That's **Duped**."

**[2:58 — wordmark]**

---
**Production notes:** record the world at high frame rate (the particle swarm is the wow). Keep the `pnpm reconcile` terminal visible during the proof beat. Have the backup recording ready.
