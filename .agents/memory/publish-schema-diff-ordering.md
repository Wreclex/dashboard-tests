---
name: Publish schema diff can order statements wrongly
description: Renaming a table sidesteps the ADD PRIMARY KEY / ADD COLUMN ordering bug in the production schema diff.
---

# Adding a column to a primary key can break a publish

Turning a single-column primary key into a composite one (add a column, then
swap the key) failed in production: the generated diff emitted the PRIMARY KEY
statement before the ADD COLUMN, and the deploy aborted mid-migration.

**Rule:** when a table's primary key has to change shape, prefer publishing the
table under a new name so the whole definition — composite key included — is
created in a single `CREATE TABLE`. Keep the Drizzle export name and update the
mapped table name only.

**Why:** the statement ordering is not under our control, and a half-applied
migration blocks every subsequent deploy.

**How to apply:** only safe when the old table's data is disposable or migrated
explicitly. Check the production row count with a read-only query first; if
rows matter, write the data copy into the same migration. Never run DDL
directly against the production database — it must go through the normal
Publish flow.

Related: `drizzle-kit generate`/`push` prompt interactively on renames and hang
in a non-interactive shell. Apply the rename to the dev database first, then
push sees no diff, and hand-write the migration SQL file.
