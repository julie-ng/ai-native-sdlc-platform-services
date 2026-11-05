// TEMPORARY (#38): seed the fixed local development run and its planner and coder
// steps, which the dev-only step context stub refers to. Safe to run repeatedly.
// Run after `npm run db:migrate`: `npm run db:seed:stub` (reads NUXT_DATABASE_URL from .env).
import { createDatabase } from '../server/db/connection.ts'
import { runs, steps } from '../server/db/schema.ts'
import { stubRunId, stubStepIds } from '../server/utils/artifact/step-context-stub.utils.ts'

const url = process.env.NUXT_DATABASE_URL
if (!url) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}

const { db, pool } = createDatabase(url)
try {
  await db.insert(runs).values({ id: stubRunId }).onConflictDoNothing()
  await db.insert(steps).values([
    { id: stubStepIds.planner, runId: stubRunId },
    { id: stubStepIds.coder, runId: stubRunId },
  ]).onConflictDoNothing()
  console.log(`Seeded run ${stubRunId} with planner ${stubStepIds.planner} and coder ${stubStepIds.coder}`)
}
finally {
  await pool.end()
}
