import { expect, test } from 'vitest'
import { titleSchema, utcInstantSchema, nameSchema, uuidSchema } from './common.schema.ts'

test('Unicode metadata length limits count code points', () => {
  expect(titleSchema.safeParse('😀'.repeat(160)).success).toBe(true)
  expect(titleSchema.safeParse('😀'.repeat(161)).success).toBe(false)
})

test('UTC timestamp validation rejects impossible dates and non-UTC representations', () => {
  expect(utcInstantSchema.safeParse('2028-02-29T10:00:00.123Z').success).toBe(true)
  for (const instant of ['2026-02-29T10:00:00Z', '2026-10-26T10:00:00+00:00', '2026-10-26T10:00:00', 'yesterday']) {
    expect(utcInstantSchema.safeParse(instant).success).toBe(false)
  }
})

test('logical names and UUIDs reject malformed values', () => {
  for (const name of ['', '../plan', 'plan.md', 'Plan', 'plän', 'a--b', 'a'.repeat(65)]) {
    expect(nameSchema.safeParse(name).success).toBe(false)
  }
  for (const id of ['x', '10000000-0000-1000-8000-000000000001', '10000000-0000-4000-0000-000000000001']) {
    expect(uuidSchema.safeParse(id).success).toBe(false)
  }
})
