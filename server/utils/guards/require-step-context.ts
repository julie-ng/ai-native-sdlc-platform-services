/**
 * Explicit guard that establishes the trusted step context for artifact routes.
 * @module
 */
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { readStepContext } from '../artifact/context.utils.ts'
import { devStepContext } from '../artifact/dev-step-context.utils.ts'

/**
 * Establish the trusted step context. Call explicitly at the start of every
 * artifact route, before reading input; this is deliberately not global
 * middleware, so each guarded route is visible and testable.
 *
 * Authentication is not implemented yet (ADR-016: HMAC tokens, #13). It will live
 * here and construct `event.context.step`. Until then:
 * - TEMPORARY (#38): on a local dev server, both `import.meta.dev` (false in any
 *   production build) and `NUXT_PUBLIC_ENVIRONMENT=local`, the unauthenticated
 *   `x-sdlc-task-type` header picks a fixed planner or coder context.
 * - Otherwise nothing sets the context, so every request fails with 503.
 *
 * Outside that stub, never build the context from body, query or headers.
 * After this call, `event.context.step` is set and validated.
 * @param event - The request event.
 * @throws H3Error 503 when no valid step context is available.
 */
export function requireStepContext(event: H3Event) {
  if (import.meta.dev && useRuntimeConfig(event).public.environment === 'local') {
    event.context.step = devStepContext(getHeader(event, 'x-sdlc-task-type'))
  }
  const result = readStepContext(event.context)
  if (!result.ok) {
    throw createError({ statusCode: 503, message: 'Step context unavailable' })
  }
  event.context.step = result.value
}
