/**
 * Explicit guards that authorize the caller for an artifact: 404 when the caller
 * holds no action on it (or it does not exist), 403 when it holds some but not the
 * requested one. Identical 404s mean an ID reveals nothing.
 * @module
 */
import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { ArtifactRef } from '../../../shared/types/artifact.ts'
import { useDB } from '../../db/use-db.ts'
import { canAccessArtifact, isArtifactVisible } from '../artifact/policy.utils.ts'
import type { ArtifactAction } from '../artifact/policy.utils.ts'
import { findArtifactById } from '../artifact/repository.utils.ts'
import type { ArtifactRecord } from '../artifact/repository.utils.ts'

/**
 * Require that the caller holds every given action on the reference. Use for
 * references that need not exist yet, such as a registration. Call after
 * `requireCallerContext`.
 * @param event - The request event; reads `event.context.caller`.
 * @param actions - All are required.
 * @throws H3Error 404 when the reference is not visible to the caller, 403 when an action is missing.
 */
export function requireArtifactPermission(event: H3Event, reference: ArtifactRef, actions: readonly ArtifactAction[]) {
  const caller = event.context.caller!
  if (!isArtifactVisible(caller, reference)) {
    throw createError({ statusCode: 404, message: 'Artifact not found' })
  }
  if (!actions.every(action => canAccessArtifact(caller, reference, action))) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
}

/**
 * Look up an artifact by ID and require one action on it. Call after
 * `requireCallerContext` and after validating the ID. After this call,
 * `event.context.artifact` is set.
 * @param event - The request event; reads `event.context.caller`.
 * @param id - Validated artifact ID.
 * @param action - Chooses the required action from the record, e.g. by its state.
 * @throws H3Error 404 when the artifact is missing or not visible, 403 when the action is not granted.
 */
export async function requireArtifactAccess(event: H3Event, id: string, action: (record: ArtifactRecord) => ArtifactAction) {
  const record = await findArtifactById(useDB(), id)
  if (!record) {
    throw createError({ statusCode: 404, message: 'Artifact not found' })
  }
  requireArtifactPermission(event, record.reference, [action(record)])
  event.context.artifact = record
}
