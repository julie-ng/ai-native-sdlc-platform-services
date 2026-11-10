import { z } from 'zod'
import { utcInstantSchema, uuidSchema } from './common.schema.ts'

export const stepRoleSchema = z.enum(['planner', 'coder'])
export type StepRole = z.infer<typeof stepRoleSchema>

const stepCredentialSchema = z.strictObject({
  stepId: uuidSchema,
  token: z.string().regex(/^[0-9a-f]{64}$/),
})

export const createRunResponseSchema = z.strictObject({
  runId: uuidSchema,
  expiresAt: utcInstantSchema,
  steps: z.strictObject({ planner: stepCredentialSchema, coder: stepCredentialSchema }),
})
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>
