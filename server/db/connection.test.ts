import { beforeEach, expect, test, vi } from 'vitest'
import { createDatabase } from './connection.ts'

const { getToken, credential } = vi.hoisted(() => {
  const getToken = vi.fn()
  return {
    getToken,
    credential: vi.fn(class {
      getToken = getToken
    }),
  }
})
vi.mock('@azure/identity', () => ({ DefaultAzureCredential: credential }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('default password authentication does not construct an Azure credential', async () => {
  const url = 'postgres://postgres:local-password@localhost:5432/postgres'
  const { pool } = createDatabase(url)
  expect(pool.options.connectionString).toBe(url)
  expect(credential).not.toHaveBeenCalled()
  await pool.end()
})

test('Entra uses a reusable credential and a dynamic password with verified TLS', async () => {
  const { pool } = createDatabase('postgres://developer%40example.com@db.postgres.database.azure.com:5432/workflow', true)
  expect(credential).toHaveBeenCalledTimes(1)
  expect(getToken).not.toHaveBeenCalled()
  expect(pool.options).toMatchObject({
    host: 'db.postgres.database.azure.com',
    port: 5432,
    database: 'workflow',
    user: 'developer@example.com',
    ssl: { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 5_000,
  })
  // A connectionString would overwrite pg's password callback during parsing.
  expect(pool.options.connectionString).toBeUndefined()
  const password = pool.options.password
  if (typeof password !== 'function') {
    throw new Error('Expected dynamic password')
  }
  getToken.mockResolvedValueOnce({ token: 'first-test-token' })
    .mockResolvedValueOnce({ token: 'second-test-token' })
  expect(await password()).toBe('first-test-token')
  expect(await password()).toBe('second-test-token')
  expect(getToken.mock.calls).toEqual([['https://ossrdbms-aad.database.windows.net/.default'], ['https://ossrdbms-aad.database.windows.net/.default']])
  expect(credential).toHaveBeenCalledTimes(1)
  getToken.mockRejectedValueOnce(new Error('Credential unavailable'))
  await expect(password()).rejects.toThrow('Credential unavailable')
  await pool.end()
})
