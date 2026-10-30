/**
 * The Nitro server's shared database: one lazily created pg pool per process,
 * used by the artifact service and the readiness check. Kept out of
 * `connection.ts`, which tests import without the Nitro runtime.
 * @module
 */
import { useRuntimeConfig } from 'nitropack/runtime'
import { useLogger } from '../utils/use-logger.ts'
import { createDatabase } from './connection.ts'
import type { Database } from './connection.ts'

/** Shared client and pool, created on first use. */
let database: ReturnType<typeof createDatabase> | undefined

/**
 * Return the shared Drizzle client, creating its pool on first use.
 *
 * An idle connection that fails (database restart, Azure failover or
 * maintenance) is logged instead of crashing the process: without an
 * `error` listener, node-postgres's pool error event is fatal. The pool
 * discards that connection and opens a new one when needed.
 * @throws Error when `NUXT_DATABASE_URL` is not configured; HTTP callers translate it.
 */
export function useDB(): Database {
  if (!database) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) {
      throw new Error('Database is not configured (NUXT_DATABASE_URL)')
    }
    database = createDatabase(databaseUrl)
    database.pool.on('error', (error) => {
      useLogger('db').error({ err: error }, 'Idle database connection failed')
    })
  }
  return database.db
}

/** End the shared pool. Called once when Nitro shuts down; does nothing if no pool was created. */
export async function closeDB() {
  const pool = database?.pool
  database = undefined
  await pool?.end()
}
