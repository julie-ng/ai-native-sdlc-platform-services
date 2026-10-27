import { createError } from 'h3'
import type { H3Event } from 'h3'
import { readCallerContext } from '../artifact/context.utils.ts'

/**
 * Require the trusted caller context. Call explicitly at the start of every
 * artifact route, before reading input.
 *
 * Upstream authentication (HMAC vs Kubernetes ServiceAccount, still open) will
 * establish `event.context.caller`. Until it exists nothing sets it, so every
 * request fails here with 503. Never build the context from body, query or headers.
 *
 * After this call, `event.context.caller` is validated.
 */
export function requireCallerContext(event: H3Event) {
  const result = readCallerContext(event.context)
  if (!result.ok) {
    throw createError({ statusCode: 503, message: 'Caller context unavailable' })
  }
  event.context.caller = result.value
}
