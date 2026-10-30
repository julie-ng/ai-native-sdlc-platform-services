/**
 * Validation of the caller context established by the caller guard.
 * @module
 */
import { callerContextSchema } from '../../../shared/utils/zod-schemas/caller-context.schema.ts'
import type { CallerContext } from './ports.ts'

/** Result of {@link readCallerContext}; failures carry no detail about what was wrong. */
export type ContextResult = { ok: true, value: CallerContext } | { ok: false, error: 'context_unavailable' }

/**
 * Read and validate the trusted caller context from an event context.
 *
 * Only the requireCallerContext guard may establish this field. Never inspect
 * body/query/headers or manufacture a caller from claims. A valid shape alone is not
 * authentication.
 *
 * Beyond the schema it enforces ownership: every input and output reference belongs
 * to the caller's run, and every output is produced by the caller's own step.
 * @param eventContext - Raw `event.context`; its `caller` property is validated.
 * @returns The validated caller, or `context_unavailable` when missing or inconsistent.
 */
export function readCallerContext(eventContext: unknown): ContextResult {
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
