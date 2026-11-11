import { beforeEach, expect, test, vi } from 'vitest'

const {
  db, migrate, useDB,
} = vi.hoisted(() => {
  const db = {}
  return {
    db,
    migrate: vi.fn(),
    useDB: vi.fn(() => db),
  }
})
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate }))
vi.mock('./use-db.ts', () => ({ useDB }))

beforeEach(() => {
  // Each test starts with a fresh module, so `migrated` starts false.
  vi.resetModules()
  vi.clearAllMocks()
})

test('readiness fails until migrations complete, then passes', async () => {
  const {
    MIGRATIONS_FOLDER, migrateDatabase, requireMigrations,
  } = await import('./migrate.ts')
  expect(() => requireMigrations()).toThrow('Database migrations have not completed')

  await migrateDatabase()

  expect(migrate).toHaveBeenCalledExactlyOnceWith(db, { migrationsFolder: MIGRATIONS_FOLDER })
  expect(() => requireMigrations()).not.toThrow()
})

test('a failed migration rejects and readiness keeps failing', async () => {
  const { migrateDatabase, requireMigrations } = await import('./migrate.ts')
  migrate.mockRejectedValueOnce(new Error('permission denied for schema public'))

  await expect(migrateDatabase()).rejects.toThrow('permission denied')
  expect(() => requireMigrations()).toThrow('Database migrations have not completed')
})

test('missing database configuration rejects without migrating', async () => {
  const { migrateDatabase } = await import('./migrate.ts')
  useDB.mockImplementationOnce(() => {
    throw new Error('Database is not configured (NUXT_DATABASE_URL)')
  })

  await expect(migrateDatabase()).rejects.toThrow('Database is not configured')
  expect(migrate).not.toHaveBeenCalled()
})

test('the migrations folder holds the generated journal', async () => {
  const { existsSync } = await import('node:fs')
  const { MIGRATIONS_FOLDER } = await import('./migrate.ts')
  expect(existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)).toBe(true)
})
