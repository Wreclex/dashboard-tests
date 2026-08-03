import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "@workspace/db";
import { logger } from "./logger";

// The compiled bundle is always at  artifacts/api-server/dist/index.mjs.
// During `pnpm run build` the migrations are copied into dist/migrations so
// the artifact is fully self-contained at:
//   dist/migrations          ← built copy (preferred)
//   ../../../lib/db/migrations ← workspace fallback for local dev without build
//
// MIGRATIONS_DIR env var overrides both (useful for custom deployment layouts).
const _bundleDir = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER =
  process.env.MIGRATIONS_DIR ??
  path.resolve(_bundleDir, "migrations");

export async function runMigrations(): Promise<void> {
  const db = drizzle(pool);

  logger.info({ folder: MIGRATIONS_FOLDER }, "Running database migrations");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  logger.info("Database migrations complete");
}
