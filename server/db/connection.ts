/**
 * Database connection factory. Server-only; export client-safe types through `shared/`.
 * @module
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.ts'

/**
 * Create a Drizzle client over its own node-postgres pool. The application
 * shares one per Nitro process (see `useDB` in `use-db.ts`); tests create their own.
 * Callers own the pool and must end it.
 * @param connectionString - PostgreSQL connection URL.
 * @returns The Drizzle client (`db`) and its pool (`pool`, end it with `pool.end()`).
 */
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5 })
  return { db: drizzle(pool, { schema }), pool }
}

/** Drizzle client type returned by {@link createDatabase}. */
export type Database = ReturnType<typeof createDatabase>['db']
/** The Drizzle schema namespace, re-exported for typed queries. */
export { schema }
