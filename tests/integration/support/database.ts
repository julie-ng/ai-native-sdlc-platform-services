import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from '../../../server/db/connection.ts'
import { runs, steps } from '../../../server/db/schema.ts'
import { workflowRecords } from '../../support/artifact-fixtures.ts'

// Defaults match compose.yaml (`npm run db:up`). Override for another disposable server.
const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'
const migrationsFolder = fileURLToPath(new URL('../../../server/db/migrations', import.meta.url))

async function admin(statement: string) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(statement)
  }
  finally {
    await client.end()
  }
}

/**
 * Create an isolated, migrated and seeded database for one test file, so test
 * files can run in parallel. `drop()` removes it; nothing shared is modified.
 */
export async function createTestDatabase() {
  const name = `artifact_test_${randomUUID().replaceAll('-', '')}`
  await admin(`CREATE DATABASE ${name}`)
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const connectionString = url.toString()
  const connect = () => createDatabase(connectionString)
  const { db, pool } = connect()
  await migrate(db, { migrationsFolder })
  await db.insert(runs).values(workflowRecords.runs)
  await db.insert(steps).values(workflowRecords.steps)
  await pool.end()
  return {
    connect,
    migrate: (database: ReturnType<typeof connect>['db']) => migrate(database, { migrationsFolder }),
    drop: () => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  }
}
