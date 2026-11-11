import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { Database } from '../../server/db/connection.ts'
import { createRun } from '../../server/utils/run/repository.utils.ts'
import { signStepToken } from '../../server/utils/auth/step-token.utils.ts'
import { requireStepContext } from '../../server/utils/guards/require-step-context.ts'
import { requireArtifactAccess } from '../../server/utils/guards/require-artifact-access.ts'
import { upsertArtifact } from '../../server/utils/artifact/repository.utils.ts'
import { createTestDatabase } from './support/database.ts'

const shared = vi.hoisted(() => ({ db: undefined as Database | undefined }))
const securityLog = vi.hoisted(() => vi.fn())
vi.mock('../../server/db/use-db.ts', () => ({ useDB: () => shared.db }))
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({
    hmacKey: 'integration-key',
    hmacTokenExpiryMinutes: 15,
    databaseUrl: 'configured',
  }),
}))
vi.mock('../../server/utils/log-security-event.utils.ts', () => ({ logSecurityEvent: securityLog }))
let database: Awaited<ReturnType<typeof createTestDatabase>>
let connection: ReturnType<typeof database.connect>
beforeAll(async () => {
  database = await createTestDatabase()
  connection = database.connect()
  shared.db = connection.db
})
afterAll(async () => {
  await connection?.pool.end()
  await database?.drop()
})
const eventFor = (runId: string, stepId: string, token: string) => ({
  node: {
    req: {
      headers: {
        'authorization': `Bearer ${token}`,
        'x-run-id': runId,
        'x-step-id': stepId,
      },
    },
  },
  context: {},
}) as unknown as H3Event

test('stored roles authenticate planner/coder, enforce membership, and retain artifact policy', async () => {
  const run = await createRun(connection.db)
  const otherRun = await createRun(connection.db)
  const planner = run.steps.find(step => step.role === 'planner')!
  const coder = run.steps.find(step => step.role === 'coder')!
  const token = (step: typeof planner) => signStepToken('integration-key', {
    runId: run.id,
    createdAt: run.createdAt,
    stepId: step.id,
    role: step.role,
  })
  const producer = eventFor(run.id, planner.id, token(planner))
  await requireStepContext(producer)
  const reference = producer.context.step!.outputs[0]!
  const { record } = await upsertArtifact(connection.db, reference, { contentType: 'text/plain' })
  const consumer = eventFor(run.id, coder.id, token(coder))
  await requireStepContext(consumer)
  expect(consumer.context.step!.inputs).toEqual([reference])
  await requireArtifactAccess(consumer, record.id, () => 'read')
  securityLog.mockClear()
  await expect(requireArtifactAccess(consumer, record.id, () => 'update')).rejects.toMatchObject({ statusCode: 403 })
  expect(securityLog).toHaveBeenCalledTimes(1)
  for (const event of [eventFor(run.id, coder.id, token(planner)), eventFor(otherRun.id, planner.id, token(planner))]) {
    securityLog.mockClear()
    await expect(requireStepContext(event)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Unauthorized',
    })
    expect(event.context.step).toBeUndefined()
    expect(securityLog).toHaveBeenCalledTimes(1)
  }
})
