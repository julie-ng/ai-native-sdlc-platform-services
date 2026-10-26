import { isArtifactValue } from '../../../shared/utils/artifact-schemas/validation.utils.ts'
import type { ReadCallerContext } from './ports.ts'

// Only middleware may establish this field. Never inspect body/query/headers or
// manufacture a caller from claims. A valid shape alone is not authentication.
export const readCallerContext: ReadCallerContext = (eventContext) => {
  if (typeof eventContext !== 'object' || eventContext === null || !('caller' in eventContext)) {
    return { ok: false, error: 'context_unavailable' }
  }
  const caller = eventContext.caller
  if (!isArtifactValue('CallerContext', caller)
    || [...caller.inputs, ...caller.outputs].some(ref => ref.runId !== caller.runId)
    || caller.outputs.some(ref => ref.producerStepId !== caller.stepId)) {
    return { ok: false, error: 'context_unavailable' }
  }
  return { ok: true, value: caller }
}
