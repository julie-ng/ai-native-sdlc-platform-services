/**
 * Fixed first-release runs: one planner and one coder, with no stored bindings.
 * @module
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/connection.ts'
import { runs, steps } from '../../db/schema.ts'

/**
 * Insert a run and both steps atomically. The returned timestamp is the stored database value.
 * @param db - Application client or an isolated test database; owns the transaction.
 * @returns The new run, its stored creation time and its planner/coder step records.
 * @throws On database failure; the transaction rolls back all run and step inserts.
 */
export async function createRun(db: Database) {
  return db.transaction(async (tx) => {
    const [run] = await tx.insert(runs).values({ id: randomUUID() }).returning()
    const created = await tx.insert(steps).values([
      { id: randomUUID(), runId: run!.id, role: 'planner' },
      { id: randomUUID(), runId: run!.id, role: 'coder' },
    ]).returning()
    return { ...run!, steps: created }
  })
}

/**
 * Fetch a run and its stored step roles in one query; unknown runs return an empty list.
 * @param db - Database containing the server-owned run and step records.
 * @param runId - Validated run UUID to look up.
 * @returns Joined run/step records, or an empty list when the run has no steps or does not exist.
 * @throws On database query failure.
 */
export async function findRunSteps(db: Database, runId: string) {
  return db.select({ run: runs, step: steps }).from(runs)
    .innerJoin(steps, eq(steps.runId, runs.id)).where(eq(runs.id, runId))
}
