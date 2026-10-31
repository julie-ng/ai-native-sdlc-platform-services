/**
 * Structured JSON logging to stdout with pino, one cached child logger per domain.
 * Kubernetes collects stdout, so there are no transports or pretty printing.
 * @module
 */
import { useRuntimeConfig } from 'nitropack/runtime'
import pino from 'pino'
import type { Logger } from 'pino'

/** Root logger, created on first use so runtime configuration is available. */
let root: Logger | undefined
/** Child loggers by domain. */
const children = new Map<string, Logger>()

/**
 * Return the pino child logger for a domain such as `http`, `db` or `readyz`;
 * every line carries that `domain`. The level is `runtimeConfig.logLevel`
 * (`NUXT_LOG_LEVEL`, default `info`); an unknown level falls back to `info`
 * with a warning instead of failing every request.
 *
 * Call inside handlers, hooks or callbacks, not at module top level: Nitro
 * bundles server files together, so imports may not be initialized yet.
 * Never log credentials, request or response bodies, or caller context. SAS URLs are
 * an accepted exception (see the decision log).
 * @param domain - Area of the service that writes the log line.
 */
export function useLogger(domain: string) {
  root ??= createRootLogger(useRuntimeConfig().logLevel)
  let child = children.get(domain)
  if (!child) {
    child = root.child({ domain })
    children.set(domain, child)
  }
  return child
}

function createRootLogger(level: string) {
  if (level === 'silent' || Object.hasOwn(pino.levels.values, level)) {
    return pino({ level })
  }
  const logger = pino({ level: 'info' })
  // Not `level`: that key would overwrite pino's own level field.
  logger.warn({ domain: 'logger', configuredLevel: level }, 'Unknown NUXT_LOG_LEVEL, using info')
  return logger
}
