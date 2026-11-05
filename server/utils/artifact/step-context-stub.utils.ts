/**
 * TEMPORARY local development stub (#38): fixed step contexts so the artifact
 * routes can be exercised before authentication exists (ADR-016, #13). Only
 * `requireStepContext` uses them, and only on a local dev server. Remove this
 * module when the guard authenticates real steps.
 * @module
 */
import type { ArtifactRef, StepContext } from '../../../shared/types/artifact.ts'

/** Fixed run for local development; `npm run db:seed:stub` inserts it. */
export const stubRunId = '00000000-0000-4000-8000-00000000d001'

/** Fixed planner and coder steps of {@link stubRunId}; `npm run db:seed:stub` inserts them. */
export const stubStepIds = {
  planner: '00000000-0000-4000-8000-00000000d101',
  coder: '00000000-0000-4000-8000-00000000d102',
} as const

/** The planner's `plan`, which the coder takes as input. */
const stubPlan: ArtifactRef = { runId: stubRunId, producerStepId: stubStepIds.planner, name: 'plan' }

const stubContexts: Record<keyof typeof stubStepIds, StepContext> = {
  planner: { runId: stubRunId, stepId: stubStepIds.planner, taskType: 'planner', inputs: [], outputs: [stubPlan] },
  coder: { runId: stubRunId, stepId: stubStepIds.coder, taskType: 'coder', inputs: [stubPlan], outputs: [] },
}

/**
 * Pick a fixed step context by task type, as sent in the `x-sdlc-task-type` header.
 * @param taskType - `planner` (also the default when absent) or `coder`.
 * @returns A copy of the context, or `undefined` for any other value, so the guard answers 503.
 */
export function stubStepContext(taskType: string | undefined): StepContext | undefined {
  const key = taskType ?? 'planner'
  if (key !== 'planner' && key !== 'coder') {
    return undefined
  }
  return structuredClone(stubContexts[key])
}
