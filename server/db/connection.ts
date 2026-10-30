import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.ts'

/**
 * Create a Drizzle client over its own node-postgres pool. The application
 * holds one per Nitro process (see useArtifactService); tests create their own.
 * Callers own the pool and must end it.
 */
export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5 })
  return { db: drizzle(pool, { schema }), pool }
}

export type Database = ReturnType<typeof createDatabase>['db']
export { schema }
