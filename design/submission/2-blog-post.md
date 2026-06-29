# How I made item duplication impossible to represent in a game economy, with Aurora DSQL

*Drafted with AI assistance, based on my own project (Duped), for the H0 hackathon.*

I pointed ten thousand concurrent "trade" requests at a single legendary sword and tried every classic dupe trick at once: trade-window races, drop-and-relog, and the same item grabbed from two AWS regions at the same instant. After the dust settled I ran one SQL query:

```sql
SELECT count(*) FROM item_instances WHERE template_id = :legendary;  -- 1
```

The answer was 1. Of those ten thousand attempts, 9,992 were rejected outright and the count never moved. It was always going to be 1, because of how the data is shaped. That is the whole idea, and this post is how it works.

> **Image — "The one query"**
> Alt: SQL query returning a count of 1 for the legendary item.
> Caption: The proof is a single count. The item exists exactly once because the schema cannot express anything else.
> screenshot this: the `/try` "Run SQL proof" modal (it shows the literal query and the returned value), or an asciinema → GIF of `pnpm reconcile`.

## The bug I was actually fighting

A dupe bug is when a player ends up with two of something that should exist once. A legendary item, a stack of gold. It has happened in New World, Diablo II, RuneScape, and plenty of others. When items carry real value, a dupe is counterfeiting, and it deflates the whole economy.

Every version of the bug is the same underlying problem wearing a costume:

- Trade-window race: two trades move one item at the same time.
- Drop-and-relog: the item is in the world and in the inventory at once.
- Disconnect mid-trade: one side is credited, the other is not.
- Cross-region: the item appears to exist in two regions and both trade it.
- Gold double-spend: two debits read the same balance.

These are concurrency and consistency failures. So I stopped thinking about it as a game bug and started treating it as a database correctness problem.

## The fix: make "owned twice" unrepresentable

I model a unique item as exactly one row, with one owner and a version number:

```
item_instances(instance_id PK, template_id, owner_type, owner_id, region, version, ...)
```

Every transfer (trade, drop, pickup, mail) is the same conditional update:

```sql
UPDATE item_instances
   SET owner_type = :to_type, owner_id = :to_id, region = :region,
       version = version + 1, updated_at = now()
 WHERE instance_id = :id AND owner_type = :from_type
   AND owner_id = :from_id AND version = :expected;
-- rowCount must be 1. If it is 0, someone already moved it: abort with ITEM_MOVED.
```

Two transfers that both think the item is at version 5, owned by A, cannot both succeed. The first to commit moves it to version 6. The second one either reads the new version and matches zero rows, or it conflicts at commit time (Aurora DSQL surfaces this as SQLSTATE 40001), retries, re-reads, and then matches zero rows. Exactly one wins. There is no row that says an item has two owners, so the demo can't produce one.

I run this on Aurora DSQL. It uses optimistic concurrency and reports write conflicts at commit, which is exactly the model this guard wants. I don't hide the 40001 retries. I count and display them, because they are the system doing its job under contention.

> **Image — "One row, one owner"**
> Alt: A hand-drawn diagram of a single item row with an owner pointer and a version counter, and two arrows trying to claim it.
> Caption: The version guard. Two concurrent claims read version 5. One bumps it to 6. The other matches nothing.
> Image prompt: Excalidraw-style hand-drawn diagram on a light/white background, one palette using teal, violet, and a gold accent. A single labelled box "item_instances: owner=A, version=5". Two thin arrows from "trade 1" and "trade 2" pointing at it. Trade 1 succeeds and the box updates to "owner=B, version=6"; trade 2 has a small "0 rows / ITEM_MOVED" note. No human figures, no explosions. Clean, lots of whitespace.

## Gold is not a sword

A sword is unique. Gold is fungible. Forcing both into the same model would be wrong, so gold gets a different protection: balances that are sharded across rows (so a whale or a treasury is never a single hot row), a `CHECK (balance_minor >= 0)` that makes overspend structurally impossible, and a balanced double-entry ledger written in the same transaction. Every move nets to zero, so the total supply is a one-line invariant.

I fired 1,000 concurrent transfers out of one whale wallet. The supply before and after was identical: 600,000 minor units in, 600,000 out, with 598 OCC retries observed and zero errors. Nothing was created, nothing vanished.

## The hardest case: two regions, one item

The cross-region dupe is the one that scares people, because a single-region database can't help you and locks don't span regions. Aurora DSQL is active-active across regions over one logical database, so I could test the real thing on a peered cluster: Tokyo (ap-northeast-1) and Seoul (ap-northeast-2).

I sent trades for the same legendary to both endpoints at the same time. Out of 482 simultaneous cross-region grabs, 482 were blocked. The count stayed 1. There is no replication-lag window to exploit, because both endpoints serialize against one source of truth.

> **Image — "Same item, two regions"**
> Alt: Two region nodes, Tokyo and Seoul, connected to one database, with a single item between them.
> Caption: 482 of 482 simultaneous cross-region grabs blocked on a real peered Tokyo and Seoul cluster.
> screenshot this: the "Cross-region Defense" panel on `/try` (shows the 482 / 482 stat and the two region nodes).

## Seeing the bug, then seeing it gone

The part that made the idea click for people was a side-by-side. I built a second, deliberately broken model: a plain inventory table with no version guard, the way a naive service might track ownership. Under a trade race, two concurrent transfers both read "A owns it" and both write a new owner, so the one legendary ends up in roughly 20 inventories. Real rows, countable with SQL.

Then I ran the same race through the kernel. The authoritative count stayed 1.

> **Image — "Two databases, same attack"**
> Alt: Side-by-side counters, one showing about 20 copies, the other showing 1.
> Caption: Same trade race. The naive table duplicates the item to ~20 copies. The version-guarded model stays at one.
> screenshot this: the `/try` "Same attack. Two databases." section right after clicking "Run the trade race" (left side shows ×~20, right side shows ×1).

## The proof, and the honest part

The whole project comes down to a reconcile step that runs the invariants as live SQL: legendary count is 1, no instance is owned twice, every item has one owner, gold supply equals what was minted, ledger drift is 0, every transaction balances, no balance is negative. All of them hold. I also wrote 12 unit tests for the pure logic (conservation, the idempotency hash, the sharding math, the backoff bounds) and they run green in CI.

The honest caveat: these guarantees hold as long as every economic action goes through the kernel. If a game has an admin minting tool or a code path that writes ownership directly, that path is outside the guarantee. Duped is the economy and trade settlement layer (trades, drops, mail, auction house, cross-region transfers), not the real-time combat loop. I would rather state that plainly than imply it covers everything.

> **Image — "All invariants hold"**
> Alt: A terminal showing the reconcile output with every invariant passing.
> Caption: The reconcile output. Each line is one SQL query against the truth core.
> screenshot this: an asciinema → GIF of `pnpm reconcile` (records the pass/fail lines as they print).

## What I learned

The thing I keep coming back to: I spent less effort "preventing" dupes and more effort making them impossible to write down. Correctness that lives in the schema doesn't depend on remembering to check. The 40001 retries felt scary at first, then became the most reassuring signal in the system, because they are proof that two writers tried to touch one row and only one was allowed through.

I also learned to show the bug before showing the fix. The version guard is a few lines of SQL. It only lands emotionally once you have watched the same attack duplicate an item in the table next to it.

The stack: Aurora DSQL as the truth core, DynamoDB as the live read model fed by a transactional outbox, Next.js on Vercel for the world. No foreign keys (DSQL doesn't have them), async indexes, money as BIGINT minor units, IAM/OIDC auth so there are no passwords in code.

---

### Notes for me before publishing
- Do a personalization pass in my own voice. Add a sentence or two of real first-person detail (what surprised me, what I got wrong first). The post should sound like me, not like a generic writeup.
- Add `#H0Hackathon` and a line: "I created this content for the H0 hackathon."
- Make sure every number still matches the repo when I publish.

### Hosting notes
- AWS Builder Center rejects external image URLs. Upload each image through its editor toolbar.
- dev.to accepts external image URLs, so hosted links are fine there.
- For the two "prove it" moments (`pnpm storm` and `pnpm reconcile`), record an asciinema cast and export to GIF. A moving terminal reads as real far better than a static shot.

### Cover image prompt (separate, ~1200×630)
Clean, text-light cover on a light/off-white background, one palette of teal, violet, and a single gold accent. A simple central motif: one glowing gold sword icon with a small "×1" label, and a faint ring of small dots bouncing off a circle around it. Plenty of negative space. No text other than a small "×1". No human figures, no explosions, no red splashes. Flat, modern, slightly hand-drawn line quality.
