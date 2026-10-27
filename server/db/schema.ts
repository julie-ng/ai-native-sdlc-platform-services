import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import type { artifactStates } from '../../shared/utils/zod-schemas/artifact.schema.ts'

/**
 * Workflow-owned run/step records. Kept minimal until the workflow service
 * exists; artifacts reference steps so ownership has a real foreign key.
 */
export const runs = pgTable('runs', {
  id: uuid('id').primaryKey(),
})

export const steps = pgTable('steps', {
  id: uuid('id').primaryKey(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'restrict' }),
})

/**
 * One current artifact per producing step/name. No attempt, revision, SAS or
 * blob-key columns: the blob key is derived from run/step/name.
 */
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  producerStepId: uuid('producer_step_id').notNull().references(() => steps.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  kind: text('kind'),
  title: text('title'),
  description: text('description'),
  state: text('state').$type<keyof typeof artifactStates>().notNull().default('reserved'),
  sizeBytes: integer('size_bytes'),
  sha256: text('sha256'),
  // Insert defaults only. Writes set updatedAt explicitly; reads never touch it.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('artifacts_producer_step_id_name_unique').on(table.producerStepId, table.name),
  check('artifacts_state_check', sql`(${table.state} = 'reserved' AND ${table.sizeBytes} IS NULL AND ${table.sha256} IS NULL)
    OR (${table.state} = 'uploaded' AND ${table.sizeBytes} IS NOT NULL AND ${table.sha256} IS NOT NULL)`),
])
