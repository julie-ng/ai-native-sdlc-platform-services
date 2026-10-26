import { callerContextSchema } from '../../../shared/utils/zod-schemas/caller-context.schema.ts'
import type { ReadCallerContext } from './ports.ts'

// Only middleware may establish this field. Never inspect body/query/headers or
// manufacture a caller from claims. A valid shape alone is not authentication.
export const readCallerContext: ReadCallerContext = (eventContext) => {
  if (typeof eventContext !== 'object' || eventContext === null || !('caller' in eventContext)) {
    return { ok: false, error: 'context_unavailable' }
  }
  const parsed = callerContextSchema.safeParse(eventContext.caller)
  if (!parsed.success) {
    return { ok: false, error: 'context_unavailable' }
  }
  const caller = parsed.data
  if ([...caller.inputs, ...caller.outputs].some(ref => ref.runId !== caller.runId)
    || caller.outputs.some(ref => ref.producerStepId !== caller.stepId)) {
    return { ok: false, error: 'context_unavailable' }
  }
  return { ok: true, value: caller }
}
