/**
 * Artifact access policy: decides, from the trusted caller context, whether a
 * caller may read, create or update an exact reference.
 * @module
 */
import type { ArtifactRef, CallerContext } from '../../../shared/types/artifact.ts'
import { readCallerContext } from './context.utils.ts'

/**
 * Action a caller may be granted on an artifact reference. Create and update stay
 * distinct, mirroring Azure's create (`c`) and write (`w`) SAS permissions, even
 * though the POC planner currently holds both.
 */
export type ArtifactAction = 'create' | 'read' | 'update'

/** Whether two references name the same run, producing step and slot. */
export function sameArtifactReference(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.runId === right.runId && left.producerStepId === right.producerStepId && left.name === right.name
}

/**
 * Task-type access policy for one reference and action.
 * - `planner`: creates and updates its own `plan` outputs; reads nothing.
 * - `coder`: reads `plan` references among its inputs and outputs; writes nothing.
 * - Any other task type, or an invalid context: no access.
 *
 * Check {@link isArtifactVisible} first: a visible artifact with a missing action is a 403.
 * @param caller - Trusted caller context.
 */
export function canAccessArtifact(caller: CallerContext, reference: ArtifactRef, action: ArtifactAction): boolean {
  // Fail closed even for typed values supplied by unvalidated JavaScript callers.
  if (!readCallerContext({ caller }).ok || reference.name !== 'plan') {
    return false
  }
  if (caller.taskType === 'planner') {
    return (action === 'create' || action === 'update') && caller.outputs.some(ref => sameArtifactReference(ref, reference))
  }
  if (caller.taskType === 'coder') {
    return action === 'read' && [...caller.inputs, ...caller.outputs].some(ref => sameArtifactReference(ref, reference))
  }
  return false
}

/**
 * Whether the caller holds any action on the reference. Invisible artifacts are
 * reported as 404 so that a caller cannot learn whether they exist.
 */
export function isArtifactVisible(caller: CallerContext, reference: ArtifactRef): boolean {
  return (['create', 'read', 'update'] as const).some(action => canAccessArtifact(caller, reference, action))
}

/**
 * References the caller may read, for discovery. They need not be registered;
 * listing returns only the records that exist.
 * @param caller - Trusted caller context.
 */
export function readableArtifactReferences(caller: CallerContext): ArtifactRef[] {
  if (!readCallerContext({ caller }).ok) {
    return []
  }
  return [...caller.inputs, ...caller.outputs].filter(ref => canAccessArtifact(caller, ref, 'read'))
}
