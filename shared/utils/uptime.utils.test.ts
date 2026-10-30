import { expect, test } from 'vitest'
import { formatUptime } from './uptime.utils.ts'

test.each([
  [0, '0 seconds'],
  [0.9, '0 seconds'],
  [1, '1 second'],
  [34, '34 seconds'],
  [60, '1 minute'],
  [1234, '20 minutes and 34 seconds'],
  [3661, '1 hour, 1 minute and 1 second'],
  [90061, '1 day, 1 hour, 1 minute and 1 second'],
  [183845, '2 days, 3 hours, 4 minutes and 5 seconds'],
  [86401, '1 day and 1 second'],
  [65.7, '1 minute and 5 seconds'],
])('formatUptime(%s) is "%s"', (seconds, expected) => {
  expect(formatUptime(seconds)).toBe(expected)
})
