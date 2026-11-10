import { requireAdminToken } from '#server/utils/guards/require-admin-token'
import { requireStepTokenConfiguration } from '#server/utils/auth/configuration.utils'
import { signStepToken, stepTokenExpiresAt } from '#server/utils/auth/step-token.utils'
import { createRun } from '#server/utils/run/repository.utils'
import { useDB } from '#server/db/use-db'
import type { CreateRunResponse } from '#shared/utils/zod-schemas/run.schema'

// Create the fixed planner/coder run and issue opaque, equally expiring step credentials.
export default defineEventHandler(async (event): Promise<CreateRunResponse> => {
  requireAdminToken(event)
  const { key, expiryMinutes } = requireStepTokenConfiguration(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const run = await createRun(useDB())
  const credential = (taskType: 'planner' | 'coder') => {
    const step = run.steps.find(step => step.taskType === taskType)!
    return {
      stepId: step.id,
      token: signStepToken(key, { runId: run.id, createdAt: run.createdAt, stepId: step.id, taskType }),
    }
  }
  setResponseStatus(event, 201)
  return {
    runId: run.id,
    expiresAt: stepTokenExpiresAt(run.createdAt, expiryMinutes).toISOString(),
    steps: { planner: credential('planner'), coder: credential('coder') },
  }
})
