import assert from 'node:assert/strict'
import { test } from 'node:test'
import { titleSchema, utcInstantSchema, nameSchema, uuidSchema } from './common.schema.ts'

test('Unicode metadata length limits count code points', () => {
  assert(titleSchema.safeParse('😀'.repeat(160)).success)
  assert(!titleSchema.safeParse('😀'.repeat(161)).success)
})

test('UTC timestamp validation rejects impossible dates and non-UTC representations', () => {
  assert(utcInstantSchema.safeParse('2028-02-29T10:00:00.123Z').success)
  for (const instant of ['2026-02-29T10:00:00Z', '2026-10-26T10:00:00+00:00', '2026-10-26T10:00:00', 'yesterday']) {
    assert(!utcInstantSchema.safeParse(instant).success)
  }
})

test('logical names and UUIDs reject malformed values', () => {
  for (const name of ['', '../plan', 'plan.md', 'Plan', 'plän', 'a--b', 'a'.repeat(65)]) {
    assert(!nameSchema.safeParse(name).success)
  }
  for (const id of ['x', '10000000-0000-1000-8000-000000000001', '10000000-0000-4000-0000-000000000001']) {
    assert(!uuidSchema.safeParse(id).success)
  }
})
