/**
 * Explicit HMAC authentication and server-owned step context for artifact routes.
 * @module
 */
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { uuidSchema } from '../../../shared/utils/zod-schemas/common.schema.ts'
import { useDB } from '../../db/use-db.ts'
import { readStepContext } from '../artifact/context.utils.ts'
import { requireStepTokenConfiguration } from '../auth/configuration.utils.ts'
import { isStepTokenExpired, verifyStepToken } from '../auth/step-token.utils.ts'
import { findRunSteps } from '../run/repository.utils.ts'
import { logSecurityEvent } from '../log-security-event.utils.ts'

/**
 * Authenticate the run/step Bearer credential, then establish validated context.
 * Call explicitly and await at the start of each artifact route. Header IDs select
 * stored records; neither headers nor pre-existing context establish permissions.
 * @param event - Request whose headers select stored run/step records and present their credential.
 * @returns Resolves after setting validated step context; rejects instead of returning context on failure.
 * @throws H3Error 401 for all invalid credentials; 503 for missing authentication configuration.
 */
export async function requireStepContext(event: H3Event) {
  delete event.context.step
  const { key, expiryMinutes } = requireStepTokenConfiguration(event)
  const token = /^Bearer ([0-9a-f]{64})$/i.exec(getHeader(event, 'authorization') ?? '')?.[1]
  const runId = uuidSchema.safeParse(getHeader(event, 'x-run-id'))
  const stepId = uuidSchema.safeParse(getHeader(event, 'x-step-id'))
  const reject = (reason: string): never => {
    logSecurityEvent(event, reason, {
      runId: runId.success ? runId.data : undefined,
      stepId: stepId.success ? stepId.data : undefined,
    })
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (!token || !runId.success || !stepId.success) {
    return reject('missing_or_malformed_credentials')
  }
  const records = await findRunSteps(useDB(), runId.data)
  const caller = records.find(record => record.step.id === stepId.data)
  if (!caller) {
    return reject('run_or_step_not_found')
  }
  const { run, step } = caller
  if (isStepTokenExpired(run.createdAt, expiryMinutes)) {
    return reject('token_expired')
  }
  if (!verifyStepToken(token, key, { runId: run.id, createdAt: run.createdAt, stepId: step.id, role: step.role })) {
    return reject('invalid_hmac')
  }
  const planners = records.filter(record => record.step.role === 'planner')
  const coders = records.filter(record => record.step.role === 'coder')
  if (records.length !== 2 || planners.length !== 1 || coders.length !== 1) {
    return reject('invalid_workflow')
  }
  const plan = { runId: run.id, producerStepId: planners[0]!.step.id, name: 'plan' }
  const context = readStepContext({
    step: {
      runId: run.id,
      stepId: step.id,
      role: step.role,
      inputs: step.role === 'coder' ? [plan] : [],
      outputs: step.role === 'planner' ? [plan] : [],
    },
  })
  if (!context.ok) {
    return reject('invalid_step_context')
  }
  event.context.step = context.value
}
