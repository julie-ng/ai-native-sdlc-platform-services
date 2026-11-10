/**
 * Schema migrations applied by the production server at startup, as the
 * application's own database identity, so that identity owns its tables.
 * Development applies migrations explicitly with `npm run db:migrate` instead.
 * @module
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { useDB } from './use-db.ts'

/**
 * Generated migrations, relative to the working directory: the repository root
 * for `npm run preview`, `/app` in the container image, which copies them there.
 */
export const MIGRATIONS_FOLDER = 'server/db/migrations'

/** Set once this process has applied all migrations. */
let migrated = false

/**
 * Apply pending migrations to the shared database. Already-applied migrations
 * are skipped, so restarts are safe; concurrent runs are not coordinated
 * (the deployment runs one replica).
 * @param migrationsFolder - Folder containing `meta/_journal.json` and the SQL files.
 * @throws Error when the database is not configured or unreachable, or a migration fails.
 */
export async function migrateDatabase(migrationsFolder = MIGRATIONS_FOLDER) {
  await migrate(useDB(), { migrationsFolder })
  migrated = true
}

/**
 * Readiness check: pass only after {@link migrateDatabase} has completed in this process.
 * @throws Error while migrations are pending.
 */
export function requireMigrations() {
  if (!migrated) {
    throw new Error('Database migrations have not completed')
  }
}
