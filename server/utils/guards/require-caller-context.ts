/**
 * Explicit guard that establishes the trusted caller context for artifact routes.
 * @module
 */
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { readCallerContext } from '../artifact/context.utils.ts'

/**
 * Establish the trusted caller context. Call explicitly at the start of every
 * artifact route, before reading input; this is deliberately not global
 * middleware, so each guarded route is visible and testable.
 *
 * Authentication is not implemented yet (#13, HMAC vs Kubernetes ServiceAccount).
 * It will live here and construct `event.context.caller`. Until then this only
 * validates a context that nothing sets, so every request fails with 503.
 * Never build the context from body, query or headers.
 *
 * After this call, `event.context.caller` is set and validated.
 * @param event - The request event.
 * @throws H3Error 503 when no valid caller context is available.
 */
export function requireCallerContext(event: H3Event) {
  const result = readCallerContext(event.context)
  if (!result.ok) {
    throw createError({ statusCode: 503, message: 'Caller context unavailable' })
  }
  event.context.caller = result.value
}
