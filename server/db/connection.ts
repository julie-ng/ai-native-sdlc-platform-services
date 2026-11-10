/**
 * Database connection factory. Server-only; export client-safe types through `shared/`.
 * @module
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { DefaultAzureCredential } from '@azure/identity'
import * as schema from './schema.ts'

// Azure Database for PostgreSQL's public-cloud resource, using Entra v2 scope syntax.
// https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity
const POSTGRES_ENTRA_TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

/**
 * Create a Drizzle client over its own node-postgres pool. The application
 * shares one per Nitro process (see `useDB` in `use-db.ts`); tests create their own.
 * Callers own the pool and must end it.
 *
 * Connecting, or waiting for a free connection when all are busy, fails after
 * 5 seconds instead of waiting indefinitely (node-postgres's default), so an
 * unreachable database fails requests and readiness checks rather than hanging.
 * Entra mode uses the URL host, port, database and username with verified TLS.
 * A token is obtained for each new connection; Azure Identity manages token caching.
 * @param connectionString - PostgreSQL connection URL; passwordless in Entra mode.
 * @param entraAuth - Opt in to Microsoft Entra authentication instead of a URL password.
 * @returns The Drizzle client (`db`) and its pool (`pool`, end it with `pool.end()`).
 */
export function createDatabase(connectionString: string, entraAuth = false) {
  let config: pg.PoolConfig = { connectionString }
  if (entraAuth) {
    const url = new URL(connectionString)
    const credential = new DefaultAzureCredential()
    // pg reparses connectionString and overwrites a password callback, even with
    // an empty URL password. Pass explicit fields so the callback survives.
    config = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      ssl: { rejectUnauthorized: true },
      password: async () => {
        const token = await credential.getToken(POSTGRES_ENTRA_TOKEN_SCOPE)
        return token.token
      },
    }
  }
  const pool = new pg.Pool({ ...config, max: 5, connectionTimeoutMillis: 5_000 })
  return { db: drizzle(pool, { schema }), pool }
}

/** Drizzle client type returned by {@link createDatabase}. */
export type Database = ReturnType<typeof createDatabase>['db']
/** The Drizzle schema namespace, re-exported for typed queries. */
export { schema }
