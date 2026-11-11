import { expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import { logSecurityEvent } from './log-security-event.utils.ts'

const warn = vi.hoisted(() => vi.fn())
vi.mock('./use-logger.ts', () => ({
  useLogger: (domain: string) => {
    expect(domain).toBe('security')
    return { warn }
  },
}))

test('logs metadata and allowlisted context, omitting queries and credentials', () => {
  const event = {
    node: {
      req: {
        headers: {
          'authorization': 'Bearer secret-token',
          'user-agent': 'test-agent',
          'x-forwarded-for': 'untrusted-ip',
        },
        socket: { remoteAddress: '127.0.0.1' },
      },
    },
    context: {},
    method: 'POST',
    path: '/api/runs?token=secret-query',
  } as unknown as H3Event
  // Runtime allowlist must hold even if an untyped caller supplies additional fields.
  const context = {
    runId: 'run',
    token: 'secret-context',
    url: 'https://blob/?sig=secret-sas',
  }
  logSecurityEvent(event, 'invalid_admin_token', context)
  expect(warn).toHaveBeenCalledExactlyOnceWith({
    reason: 'invalid_admin_token',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    method: 'POST',
    path: '/api/runs',
    runId: 'run',
    stepId: undefined,
    requiredActions: undefined,
    grantedActions: undefined,
  }, 'Request denied')
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
})
