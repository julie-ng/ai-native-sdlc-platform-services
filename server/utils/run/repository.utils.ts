/**
 * Fixed first-release runs: one planner and one coder, with no stored bindings.
 * @module
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/connection.ts'
import { runs, steps } from '../../db/schema.ts'

/** Insert a run and both steps atomically. The returned timestamp is the stored database value. */
export async function createRun(db: Database) {
  return db.transaction(async (tx) => {
    const [run] = await tx.insert(runs).values({ id: randomUUID() }).returning()
    const created = await tx.insert(steps).values([
      { id: randomUUID(), runId: run!.id, taskType: 'planner' },
      { id: randomUUID(), runId: run!.id, taskType: 'coder' },
    ]).returning()
    return { ...run!, steps: created }
  })
}

/** Fetch a run and its stored step roles in one query; unknown runs return an empty list. */
export async function findRunSteps(db: Database, runId: string) {
  return db.select({ run: runs, step: steps }).from(runs)
    .innerJoin(steps, eq(steps.runId, runs.id)).where(eq(runs.id, runId))
}
