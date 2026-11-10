import { beforeEach, expect, test, vi } from 'vitest'
import { closeDB, useDB } from './use-db.ts'

const { config, createDatabase, pool, db } = vi.hoisted(() => {
  const pool = { on: vi.fn(), end: vi.fn() }
  const db = {}
  return {
    config: { databaseUrl: 'postgres://localhost/workflow', databaseEntraAuth: false as boolean | string },
    pool,
    db,
    createDatabase: vi.fn(() => ({ pool, db })),
  }
})
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }))
vi.mock('./connection.ts', () => ({ createDatabase }))
vi.mock('../utils/use-logger.ts', () => ({ useLogger: () => ({ error: vi.fn() }) }))

beforeEach(async () => {
  await closeDB()
  vi.clearAllMocks()
  config.databaseUrl = 'postgres://localhost/workflow'
  config.databaseEntraAuth = false
})

test.each([false, 'false', '', '1'])('does not opt in for %j', (value) => {
  config.databaseEntraAuth = value
  expect(useDB()).toBe(db)
  expect(createDatabase).toHaveBeenCalledWith(config.databaseUrl, false)
})

test.each([true, 'true'])('opts in for %j and reuses the shared pool', (value) => {
  config.databaseEntraAuth = value
  expect(useDB()).toBe(db)
  expect(useDB()).toBe(db)
  expect(createDatabase).toHaveBeenCalledExactlyOnceWith(config.databaseUrl, true)
  expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function))
})

test('missing database configuration fails before constructing a pool', () => {
  config.databaseUrl = ''
  expect(() => useDB()).toThrow('Database is not configured')
  expect(createDatabase).not.toHaveBeenCalled()
})
