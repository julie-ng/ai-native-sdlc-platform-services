import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { StepContext } from '../../shared/types/artifact.ts'
import type { Database } from '../../server/db/connection.ts'
import { requireArtifactAccess, requireArtifactPermission } from '../../server/utils/guards/require-artifact-access.ts'
import { readableArtifactReferences } from '../../server/utils/artifact/policy.utils.ts'
import { listArtifactsByReferences, recordUploadReport, upsertArtifact } from '../../server/utils/artifact/repository.utils.ts'
import { contexts, planP1, planP2 } from '../support/artifact-fixtures.ts'
import { createTestDatabase } from './support/database.ts'

// The guard reads the Nitro server's shared database; point it at this file's test database.
const shared = vi.hoisted(() => ({ db: undefined as Database | undefined }))
vi.mock('../../server/db/use-db.ts', () => ({ useDB: () => shared.db }))

let database: Awaited<ReturnType<typeof createTestDatabase>>
let connection: ReturnType<typeof database.connect>
const securityLog = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/log-security-event.utils.ts', () => ({ logSecurityEvent: securityLog }))

const eventFor = (step: StepContext) => ({ context: { step } }) as unknown as H3Event
const missingId = '40000000-0000-4000-8000-000000000099'
const report = { state: 'uploaded', sizeBytes: 5, sha256: 'a'.repeat(64) } as const

beforeAll(async () => {
  database = await createTestDatabase()
  connection = database.connect()
  shared.db = connection.db
})
afterAll(async () => {
  await connection?.pool.end()
  await database?.drop()
})

test('planner to coder handoff: register, report, discover, read', async () => {
  const planner = eventFor(contexts['planner-p1'])
  requireArtifactPermission(planner, planP1, ['create', 'update'])
  const { record } = await upsertArtifact(connection.db, planP1, { contentType: 'text/markdown' })

  // The first report on a reserved artifact needs create; the guard passes the stored record.
  const chooseAction = vi.fn((stored: { state: string }) => stored.state === 'reserved' ? 'create' as const : 'update' as const)
  await requireArtifactAccess(planner, record.id, chooseAction)
  expect(chooseAction).toHaveReturnedWith('create')
  expect(planner.context.artifact).toStrictEqual(record)
  await recordUploadReport(connection.db, record.id, report)
  // Later reports need update.
  await requireArtifactAccess(eventFor(contexts['planner-p1']), record.id, chooseAction)
  expect(chooseAction).toHaveLastReturnedWith('update')

  const coder = eventFor(contexts['coder-c1'])
  const listed = await listArtifactsByReferences(connection.db, readableArtifactReferences(contexts['coder-c1']))
  expect(listed.map(artifact => artifact.id)).toStrictEqual([record.id])
  await requireArtifactAccess(coder, record.id, () => 'read')
  expect(coder.context.artifact).toMatchObject({ id: record.id, state: 'uploaded', sizeBytes: 5 })
})

test('missing and invisible artifacts are the same 404, and set no artifact', async () => {
  const { record: p2 } = await upsertArtifact(connection.db, planP2, { contentType: 'text/markdown' })
  for (const [step, id, action] of [
    [contexts['coder-c1'], missingId, 'read'],
    // P2's plan exists but is not bound to C1 or P1.
    [contexts['coder-c1'], p2.id, 'read'],
    [contexts['planner-p1'], p2.id, 'update'],
    [contexts['planner-p1'], p2.id, 'create'],
    [contexts['unknown-task'], p2.id, 'read'],
  ] as const) {
    const event = eventFor(step)
    await expect(requireArtifactAccess(event, id, () => action)).rejects.toMatchObject({ statusCode: 404, message: 'Artifact not found' })
    expect(event.context.artifact).toBeUndefined()
  }
})

test('a visible artifact with the wrong action is 403', async () => {
  const { record } = await upsertArtifact(connection.db, planP1, { contentType: 'text/markdown' })
  // Planner can write its plan but not read it; coder can read but not write.
  for (const [step, action] of [
    [contexts['planner-p1'], 'read'],
    [contexts['coder-c1'], 'create'],
    [contexts['coder-c1'], 'update'],
  ] as const) {
    const event = eventFor(step)
    await expect(requireArtifactAccess(event, record.id, () => action)).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' })
    expect(event.context.artifact).toBeUndefined()
  }
})
