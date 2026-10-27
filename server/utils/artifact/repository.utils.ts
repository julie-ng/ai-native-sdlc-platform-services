import { and, asc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/connection.ts'
import { artifacts, steps } from '../../db/schema.ts'
import type { ArtifactRecord, ArtifactRepository, UploadedArtifact } from './ports.ts'

const columns = { ...getTableColumns(artifacts), runId: steps.runId }
type Row = typeof artifacts.$inferSelect & { runId: string }

// Absent optional metadata is SQL NULL and omitted from records.
function toRecord(row: Row): ArtifactRecord {
  const base = {
    id: row.id,
    reference: { runId: row.runId, producerStepId: row.producerStepId, name: row.name },
    metadata: {
      contentType: row.contentType,
      ...(row.kind === null ? {} : { kind: row.kind }),
      ...(row.title === null ? {} : { title: row.title }),
      ...(row.description === null ? {} : { description: row.description }),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  if (row.state === 'uploaded' && row.sizeBytes !== null && row.sha256 !== null) {
    return { ...base, state: 'uploaded', sizeBytes: row.sizeBytes, sha256: row.sha256 }
  }
  return { ...base, state: 'reserved', sizeBytes: null, sha256: null }
}

/**
 * PostgreSQL artifact metadata. Every lookup joins the workflow-owned step so
 * the returned reference carries the step's actual run.
 */
export function createArtifactRepository(db: Database): ArtifactRepository {
  async function findById(id: string) {
    const [row] = await db.select(columns).from(artifacts)
      .innerJoin(steps, eq(steps.id, artifacts.producerStepId))
      .where(eq(artifacts.id, id))
    return row ? toRecord(row) : undefined
  }

  return {
    findById,

    async upsert(reference, { contentType, kind, title, description }) {
      const metadata = { contentType, kind: kind ?? null, title: title ?? null, description: description ?? null }
      const { id, created } = await db.transaction(async (tx) => {
        const [step] = await tx.select({ id: steps.id }).from(steps)
          .where(and(eq(steps.id, reference.producerStepId), eq(steps.runId, reference.runId)))
        if (!step) {
          throw new Error('Producing step is not registered in the caller\'s run')
        }
        const [inserted] = await tx.insert(artifacts)
          .values({ producerStepId: reference.producerStepId, name: reference.name, ...metadata })
          .onConflictDoNothing({ target: [artifacts.producerStepId, artifacts.name] })
          .returning({ id: artifacts.id })
        if (inserted) {
          return { id: inserted.id, created: true }
        }
        // Last write wins for descriptive metadata; state, size and hash stay.
        const [updated] = await tx.update(artifacts)
          .set({ ...metadata, updatedAt: sql`now()` })
          .where(and(eq(artifacts.producerStepId, reference.producerStepId), eq(artifacts.name, reference.name)))
          .returning({ id: artifacts.id })
        return { id: updated!.id, created: false }
      })
      return { record: (await findById(id))!, created }
    },

    async listByReferences(references) {
      if (references.length === 0) {
        return []
      }
      const rows = await db.select(columns).from(artifacts)
        .innerJoin(steps, eq(steps.id, artifacts.producerStepId))
        .where(or(...references.map(ref => and(
          eq(steps.runId, ref.runId),
          eq(artifacts.producerStepId, ref.producerStepId),
          eq(artifacts.name, ref.name),
        ))))
        .orderBy(asc(artifacts.createdAt), asc(artifacts.id))
      return rows.map(toRecord)
    },

    async acknowledge(id, { sizeBytes, sha256 }) {
      const [updated] = await db.update(artifacts)
        .set({ state: 'uploaded', sizeBytes, sha256, updatedAt: sql`now()` })
        .where(eq(artifacts.id, id))
        .returning({ id: artifacts.id })
      if (!updated) {
        throw new Error('Artifact disappeared before its upload was recorded')
      }
      return (await findById(id)) as UploadedArtifact
    },
  }
}
