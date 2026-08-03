---
name: Scheduled report delivery
description: Reliability rules for background Telegram report dispatching.
---

Scheduled delivery must use a persisted absolute due time rather than minute-of-hour modulo, and each send must be claimed with a database-backed, token-fenced lease.

**Why:** Intervals such as seven minutes cross hour boundaries, and multiple API instances can otherwise deliver the same report or let an old worker clear a newer worker's lock.

**How to apply:** Initialize the next run when a schedule activates, advance it atomically while claiming, and only complete or release a claim when its lease token still matches. Bound external data and delivery calls inside the lease window.