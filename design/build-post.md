# Build post — "We made item dupes unrepresentable with Aurora DSQL" (#H0Hackathon)

> Publish publicly (builder.aws.com / dev.to / Medium / LinkedIn / YouTube) for the H0 bonus (+0.2 each, max +0.6). It MUST state it was created for this hackathon and use **#H0Hackathon**. Each piece must be public, not unlisted.

---

*I built this for the H0: Hack the Zero Stack hackathon, using Aurora DSQL and Vercel.*

## Killing the 25-year-old dupe bug with a database

Every online game eventually ships a **dupe bug**: one legendary item becomes two, or the same gold gets spent twice, and the economy melts down. Amazon's *New World* repeatedly froze trading over it. Diablo II and RuneScape ran on dupes for years. Teams of hundreds keep shipping them — because the root cause isn't bad luck, it's **distributed-systems correctness**.

So I asked: what if duplication were *unrepresentable* in the authoritative state, not just checked-for?

### Two kinds of object, two protections

**A sword is not money** — so I don't force both into a ledger.

- **Unique items** are exactly one row in `item_instances`, with one `owner_id` and a `version`. Every transfer — trade, drop, pickup, mail — is the same conditional update on Aurora DSQL:

  ```sql
  UPDATE item_instances
     SET owner_id = :to, version = version + 1
   WHERE instance_id = :id AND owner_id = :from AND version = :expected;  -- rowCount must be 1
  ```

  Two concurrent transfers can't both match `owner_id = :from AND version = :expected`. The first to commit bumps the version; the other matches zero rows (or conflicts at commit as SQLSTATE 40001 and retries, then sees the new version). **Exactly one wins. "Owned twice" has no representation.**

- **Gold** is sharded conserved balances (`CHECK >= 0`) plus a balanced double-entry ledger, written in the *same* transaction. `SUM(signed_amount) = 0` is a one-line "no inflation" proof.

### Why Aurora DSQL

DSQL gives me **active-active strong consistency across regions** over one logical database, with optimistic concurrency. That makes the nastiest dupe — the **cross-region** one — collapse: a trade in Tokyo and a trade in Seoul on the same item serialize against one source of truth. I proved it on a real peered Tokyo (`ap-northeast-1`) ⇄ Seoul (`ap-northeast-2`) cluster: **482 simultaneous cross-region grabs of one legendary, every single one blocked, count stayed 1.**

DynamoDB powers the live "world" read model (the settlement feed + the legendary's single location), written only by a transactional outbox projector — never inside the trade transaction.

### The result

10,000 bots attacking one legendary: a handful of legitimate trades settle, thousands of duplication attempts are blocked, optimistic-concurrency retries are visible (we surface them, never hide them), and the count never leaves **1**. The whole thing runs on Vercel, and one SQL query proves it: `count(*) WHERE template = legendary` = 1, gold supply = minted, ledger drift = 0.

Duplication isn't patched. The authoritative state has no way to represent it.

*Built with Aurora DSQL + DynamoDB + Vercel for #H0Hackathon.*
