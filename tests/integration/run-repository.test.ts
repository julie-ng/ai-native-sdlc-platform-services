import { afterAll, beforeAll, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { runs, steps } from '../../server/db/schema.ts'
import { createRun, findRunSteps } from '../../server/utils/run/repository.utils.ts'
import { createTestDatabase } from './support/database.ts'

let database: Awaited<ReturnType<typeof createTestDatabase>>
let connection: ReturnType<typeof database.connect>
beforeAll(async () => {
  database = await createTestDatabase()
  connection = database.connect()
})
afterAll(async () => {
  await connection?.pool.end()
  await database?.drop()
})

test('creates one planner and coder with a stored, immutable creation timestamp', async () => {
  const run = await createRun(connection.db)
  expect(run.steps.map(step => step.role).sort()).toEqual(['coder', 'planner'])
  expect(new Set(run.steps.map(step => step.id)).size).toBe(2)
  expect(run.steps.every(step => step.runId === run.id)).toBe(true)
  expect(run.createdAt).toBeInstanceOf(Date)
  const fresh = database.connect()
  try {
    const rows = await findRunSteps(fresh.db, run.id)
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.run.createdAt.toISOString() === run.createdAt.toISOString())).toBe(true)
  } finally {
    await fresh.pool.end()
  }
  expect(await findRunSteps(connection.db, randomUUID())).toEqual([])
})

test('step insertion failure rolls back the run as well', async () => {
  // Real database failure after inserting the run, rather than a mocked transaction.
  await connection.db.execute(sql`CREATE FUNCTION reject_new_steps() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'test step insertion failure'; END;
    $$ LANGUAGE plpgsql`)
  await connection.db.execute(sql`CREATE TRIGGER reject_new_steps BEFORE INSERT ON steps
    FOR EACH ROW EXECUTE FUNCTION reject_new_steps()`)
  const before = await connection.db.select().from(runs)
  try {
    await expect(createRun(connection.db)).rejects.toThrow()
    expect(await connection.db.select().from(runs)).toEqual(before)
  } finally {
    await connection.db.execute(sql`DROP TRIGGER reject_new_steps ON steps`)
    await connection.db.execute(sql`DROP FUNCTION reject_new_steps()`)
  }
})

test('stored step roles are required and restricted to planner/coder', async () => {
  const run = await createRun(connection.db)
  await expect(connection.db.execute(sql`INSERT INTO steps (id, run_id) VALUES (${randomUUID()}, ${run.id})`)).rejects.toThrow()
  await expect(connection.db.execute(sql`INSERT INTO steps (id, run_id, role) VALUES (${randomUUID()}, ${run.id}, 'admin')`)).rejects.toThrow()
  expect((await connection.db.select().from(steps)).some(step => step.runId === run.id)).toBe(true)
})
