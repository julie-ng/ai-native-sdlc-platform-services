/**
 * Validation of the step context established by the step context guard.
 * @module
 */
import { stepContextSchema } from '../../../shared/utils/zod-schemas/step-context.schema.ts'
import type { StepContext } from '../../../shared/types/artifact.ts'

/** Result of {@link readStepContext}; failures carry no detail about what was wrong. */
export type ContextResult = {
  ok: true
  value: StepContext
} | {
  ok: false
  error: 'context_unavailable'
}

/**
 * Read and validate the trusted step context from an event context.
 *
 * Only the requireStepContext guard may establish this field. Never inspect
 * body/query/headers or manufacture a context from claims. A valid shape alone is not
 * authentication.
 *
 * Beyond the schema it enforces ownership: every input and output reference belongs
 * to the caller's run, and every output is produced by the caller's own step.
 * @param eventContext - Raw `event.context`; its `step` property is validated.
 * @returns The validated step context, or `context_unavailable` when missing or inconsistent.
 */
export function readStepContext(eventContext: unknown): ContextResult {
  if (typeof eventContext !== 'object' || eventContext === null || !('step' in eventContext)) {
    return {
      ok: false,
      error: 'context_unavailable',
    }
  }
  const parsed = stepContextSchema.safeParse(eventContext.step)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'context_unavailable',
    }
  }
  const step = parsed.data
  if ([...step.inputs, ...step.outputs].some(ref => ref.runId !== step.runId)
    || step.outputs.some(ref => ref.producerStepId !== step.stepId)) {
    return {
      ok: false,
      error: 'context_unavailable',
    }
  }
  return {
    ok: true,
    value: step,
  }
}
