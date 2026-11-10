/**
 * Opaque HMAC credentials bound to stored run creation, step scope and task actions.
 * @module
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { TaskType } from '../../../shared/utils/zod-schemas/run.schema.ts'
import type { ArtifactAction } from '../artifact/policy.utils.ts'

/** Actions signed for each supported task type, matching the artifact policy. */
export const taskActions = {
  planner: ['create', 'update'],
  coder: ['read'],
} as const satisfies Record<TaskType, readonly ArtifactAction[]>

/** Server-owned values required to reconstruct a step credential. */
export interface StepTokenScope {
  runId: string
  createdAt: Date
  stepId: string
  taskType: TaskType
}

/** Sign a canonical JSON tuple; delimiters inside a value cannot change its boundaries. */
export function signStepToken(key: string, scope: StepTokenScope): string {
  const canonical = JSON.stringify([
    scope.runId, scope.createdAt.toISOString(), `step:${scope.stepId}`, [...taskActions[scope.taskType]].sort(),
  ])
  return createHmac('sha256', key).update(canonical).digest('hex')
}

/** Verify canonical lowercase SHA-256 hex without comparing secret-dependent bytes normally. */
export function verifyStepToken(token: string, key: string, scope: StepTokenScope): boolean {
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return false
  }
  return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(signStepToken(key, scope), 'hex'))
}

/** Compare arbitrary opaque admin tokens using fixed-length digests, including unequal input lengths. */
export function equalAdminToken(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}

/** Absolute shared step-token deadline from the stored run timestamp and configured window. */
export function stepTokenExpiresAt(createdAt: Date, expiryMinutes: number): Date {
  return new Date(createdAt.getTime() + expiryMinutes * 60_000)
}

/** A token is expired at its deadline, not only after it. */
export function isStepTokenExpired(createdAt: Date, expiryMinutes: number, now = new Date()): boolean {
  return now.getTime() >= stepTokenExpiresAt(createdAt, expiryMinutes).getTime()
}
