// TEMPORARY (#38): seed the fixed local development run and its planner and coder
// steps, which the dev-only step context stub refers to. Safe to run repeatedly.
// Run after `npm run db:migrate`: `npm run db:seed` (reads NUXT_DATABASE_URL from .env).
import { createDatabase } from '../server/db/connection.ts'
import { runs, steps } from '../server/db/schema.ts'
import { devRunId, devStepIds } from '../server/utils/artifact/dev-step-context.utils.ts'

const url = process.env.NUXT_DATABASE_URL
if (!url) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}

const { db, pool } = createDatabase(url)
try {
  await db.insert(runs).values({ id: devRunId }).onConflictDoNothing()
  await db.insert(steps).values([
    { id: devStepIds.planner, runId: devRunId },
    { id: devStepIds.coder, runId: devRunId },
  ]).onConflictDoNothing()
  console.log(`Seeded run ${devRunId} with planner ${devStepIds.planner} and coder ${devStepIds.coder}`)
}
finally {
  await pool.end()
}
