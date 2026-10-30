import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, assert, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { artifacts } from '../../server/db/schema.ts'
import { createArtifactRepository } from '../../server/utils/artifact/repository.utils.ts'
import { otherP1, planP1, planP2, planRunB, runA, stepIds } from '../support/artifact-fixtures.ts'
import { createTestDatabase } from './support/database.ts'

let database: Awaited<ReturnType<typeof createTestDatabase>>
let connection: ReturnType<typeof database.connect>
const repository = () => createArtifactRepository(connection.db)

beforeAll(async () => {
  database = await createTestDatabase()
  connection = database.connect()
})
afterAll(async () => {
  await connection?.pool.end()
  await database?.drop()
})

test('migrations can be applied again safely', async () => {
  await database.migrate(connection.db)
})

test('register, replace metadata, report uploads and keep one stable record', async () => {
  const first = await repository().upsert(planP1, { contentType: 'text/markdown', title: 'Plan', kind: 'notes' })
  expect(first.created).toBe(true)
  expect(first.record).toMatchObject({ reference: planP1, state: 'reserved', sizeBytes: null, sha256: null, metadata: { contentType: 'text/markdown', title: 'Plan', kind: 'notes' } })
  expect(first.record.createdAt).toBe(first.record.updatedAt)
  expect(first.record.createdAt).toMatch(/Z$/)

  await sleep(5)
  const again = await repository().upsert(planP1, { contentType: 'text/plain' })
  expect(again.created).toBe(false)
  expect(again.record.id).toBe(first.record.id)
  // Last write wins; omitted optional metadata becomes NULL and is omitted.
  expect(again.record.metadata).toStrictEqual({ contentType: 'text/plain' })
  expect(again.record.createdAt).toBe(first.record.createdAt)
  expect(again.record.updatedAt > first.record.updatedAt).toBe(true)

  await sleep(5)
  const uploaded = await repository().acknowledge(first.record.id, { sizeBytes: 5, sha256: 'a'.repeat(64) })
  expect(uploaded).toMatchObject({ id: first.record.id, state: 'uploaded', sizeBytes: 5, sha256: 'a'.repeat(64) })
  expect(uploaded.updatedAt > again.record.updatedAt).toBe(true)

  const replaced = await repository().acknowledge(first.record.id, { sizeBytes: 13, sha256: 'b'.repeat(64) })
  expect(replaced).toMatchObject({ sizeBytes: 13, sha256: 'b'.repeat(64) })

  // A repeated POST after upload keeps the reported content.
  const afterUpload = await repository().upsert(planP1, { contentType: 'text/markdown' })
  expect(afterUpload.record).toMatchObject({ state: 'uploaded', sizeBytes: 13 })
})

test('reads leave timestamps unchanged and survive a new connection pool', async () => {
  const { record } = await repository().upsert(planP2, { contentType: 'text/markdown' })
  expect(await repository().findById(record.id)).toStrictEqual(record)
  await connection.pool.end()
  connection = database.connect()
  expect(await repository().findById(record.id)).toStrictEqual(record)
  expect(await repository().findById('40000000-0000-4000-8000-000000000099')).toBeUndefined()
})

test('listing matches exact references, including run, in creation order', async () => {
  const listed = await repository().listByReferences([planP2, planP1, otherP1, planRunB])
  expect(listed.map(record => record.reference)).toStrictEqual([planP1, planP2])
  expect(await repository().listByReferences([{ ...planP1, runId: planRunB.runId }])).toStrictEqual([])
  expect(await repository().listByReferences([])).toStrictEqual([])
})

test('a producing step must exist in the caller\'s run', async () => {
  await expect(repository().upsert({ ...planP1, runId: planRunB.runId, name: 'mismatch' }, { contentType: 'text/plain' })).rejects.toThrow('not registered')
  await expect(repository().upsert({ runId: runA, producerStepId: '20000000-0000-4000-8000-000000000099', name: 'plan' }, { contentType: 'text/plain' })).rejects.toThrow('not registered')
})

test('PostgreSQL enforces the step foreign key, step/name uniqueness and upload fields', async () => {
  const insert = (values: Partial<typeof artifacts.$inferInsert>) => connection.db.insert(artifacts)
    .values({ producerStepId: stepIds.coderC1, name: 'constraint', contentType: 'text/plain', ...values })
  const failure = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => undefined, (error: unknown) => error)
    assert(error instanceof Error && error.cause instanceof Error)
    return error.cause.message
  }
  expect(await failure(insert({ producerStepId: '20000000-0000-4000-8000-000000000099' }))).toMatch(/foreign key/)
  expect(await failure(insert({ producerStepId: planP1.producerStepId, name: 'plan' }))).toMatch(/artifacts_producer_step_id_name_unique/)
  expect(await failure(insert({ state: 'uploaded' }))).toMatch(/artifacts_state_check/)
  expect(await failure(insert({ sizeBytes: 5 }))).toMatch(/artifacts_state_check/)
  const [{ count }] = (await connection.db.execute<{ count: string }>(sql`SELECT count(*) FROM artifacts WHERE name = 'constraint'`)).rows as [{ count: string }]
  expect(count).toBe('0')
})
