/**
 * Artifact access policy: derives, from the trusted caller context, which exact
 * references a caller may read, create and update.
 * @module
 */
import type { ArtifactAction, ArtifactAccess, ArtifactRef, CallerContext, DeriveArtifactAccess } from './ports.ts'
import { readCallerContext } from './context.utils.ts'

/** Whether two references name the same run, producing step and slot. */
export function sameArtifactReference(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.runId === right.runId && left.producerStepId === right.producerStepId && left.name === right.name
}

/** Remove duplicate references, returning independent copies. */
function unique(references: readonly ArtifactRef[]): ArtifactRef[] {
  return references.filter((ref, index) => references.findIndex(other => sameArtifactReference(ref, other)) === index)
    .map(ref => ({ ...ref }))
}

/** Every reference granted by any action, without duplicates. */
export function visibleArtifactReferences(access: ArtifactAccess): ArtifactRef[] {
  return unique([...access.readable, ...access.creatable, ...access.updatable])
}

/**
 * Task-type access policy.
 * - `planner`: creates and updates its own `plan` outputs; reads nothing.
 * - `coder`: reads `plan` references among its inputs and outputs; writes nothing.
 * - Any other task type, or an invalid context: no access.
 * @param caller - Trusted caller context.
 */
export const deriveArtifactAccess: DeriveArtifactAccess = (caller) => {
  // Fail closed even for typed values supplied by unvalidated JavaScript callers.
  if (!readCallerContext({ caller }).ok) {
    return { readable: [], creatable: [], updatable: [] }
  }
  if (caller.taskType === 'planner') {
    const ownPlans = unique(caller.outputs.filter(ref => ref.name === 'plan'))
    return { readable: [], creatable: ownPlans, updatable: unique(ownPlans) }
  }
  if (caller.taskType === 'coder') {
    return { readable: unique([...caller.inputs, ...caller.outputs].filter(ref => ref.name === 'plan')), creatable: [], updatable: [] }
  }
  return { readable: [], creatable: [], updatable: [] }
}

/**
 * Whether the caller holds any action on the reference. Invisible artifacts are
 * reported as 404 so that a caller cannot learn whether they exist.
 */
export function isArtifactVisible(caller: CallerContext, reference: ArtifactRef): boolean {
  return visibleArtifactReferences(deriveArtifactAccess(caller)).some(ref => sameArtifactReference(ref, reference))
}

/**
 * Whether the caller holds a specific action on the reference. Check
 * {@link isArtifactVisible} first: a visible artifact with a missing action is a 403.
 */
export function canAccessArtifact(caller: CallerContext, reference: ArtifactRef, action: ArtifactAction): boolean {
  const access = deriveArtifactAccess(caller)
  switch (action) {
    case 'read': return access.readable.some(ref => sameArtifactReference(ref, reference))
    case 'create': return access.creatable.some(ref => sameArtifactReference(ref, reference))
    case 'update': return access.updatable.some(ref => sameArtifactReference(ref, reference))
    default: return false
  }
}
