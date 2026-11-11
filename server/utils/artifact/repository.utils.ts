/**
 * PostgreSQL queries for artifact metadata, using Drizzle. Functions throw on
 * unexpected failures, which the HTTP layer reports as 500s. Lookups are plain:
 * the artifact guards authorize the caller.
 * @module
 */
import { and, asc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import type { ArtifactInfo, ArtifactRef, CompleteArtifactRequest, CreateArtifactRequest } from '../../../shared/types/artifact.ts'
import type { Database } from '../../db/connection.ts'
import { artifacts, steps } from '../../db/schema.ts'

/** Descriptive metadata of an artifact: the create request without the slot `name`. */
export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
/**
 * Stored artifact. Internal: includes the producing step reference. Size and hash are
 * set only when `uploaded`, and details only after a report. The database CHECK
 * constraint enforces this, so the type deliberately does not repeat it per state.
 */
export interface ArtifactRecord {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  state: ArtifactInfo['state']
  sizeBytes: number | null
  sha256: string | null
  details?: string
  createdAt: string // UTC ISO instant, fixed on first registration.
  updatedAt: string // Refreshed by every accepted write (repeated POST or upload report).
}

/** Artifact columns plus the run ID from the workflow-owned step the artifact references. */
const columns = {
  ...getTableColumns(artifacts),
  runId: steps.runId,
}
/** An artifact row joined with its step's run ID. */
type Row = typeof artifacts.$inferSelect & { runId: string }

/**
 * Map a joined row to a record. Absent optional metadata is SQL NULL and omitted from records.
 * @param row - Artifact row joined with its producing step's run ID.
 * @returns Internal artifact metadata with ISO instants and absent optional fields omitted.
 */
function toRecord(row: Row): ArtifactRecord {
  return {
    id: row.id,
    reference: {
      runId: row.runId,
      producerStepId: row.producerStepId,
      name: row.name,
    },
    metadata: {
      contentType: row.contentType,
      ...(row.kind === null ? {} : { kind: row.kind }),
      ...(row.title === null ? {} : { title: row.title }),
      ...(row.description === null ? {} : { description: row.description }),
    },
    state: row.state,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    ...(row.details === null ? {} : { details: row.details }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Look up a record by ID without any access check. The lookup joins the
 * workflow-owned step, so the returned reference carries the step's actual run.
 * @param db - Database containing artifact and workflow records.
 * @param id - Validated artifact UUID; access is checked separately by the caller.
 * @returns The record, or `undefined` when absent.
 */
export async function findArtifactById(db: Database, id: string): Promise<ArtifactRecord | undefined> {
  const [row] = await db.select(columns).from(artifacts)
    .innerJoin(steps, eq(steps.id, artifacts.producerStepId))
    .where(eq(artifacts.id, id))
  return row ? toRecord(row) : undefined
}

/**
 * Insert the artifact, or replace its descriptive metadata when the step/name
 * record exists, in one transaction. Last write wins for metadata; state, size and
 * hash are kept. SAS URLs are never stored.
 * @param db - Database containing the producing step and artifact metadata.
 * @param reference - Exact step-owned slot; the step must belong to `reference.runId`.
 * @param fields - Descriptive metadata replacing the previous values; omitted optional values are cleared.
 * @returns The stored record and whether this call created it.
 * @throws If the producing step is not registered in the reference's run.
 */
export async function upsertArtifact(db: Database, reference: ArtifactRef, fields: ArtifactMetadata) {
  const {
    contentType, kind, title, description,
  } = fields
  const metadata = {
    contentType,
    kind: kind ?? null,
    title: title ?? null,
    description: description ?? null,
  }
  const { id, created } = await db.transaction(async (tx) => {
    const [step] = await tx.select({ id: steps.id }).from(steps)
      .where(and(eq(steps.id, reference.producerStepId), eq(steps.runId, reference.runId)))
    if (!step) {
      throw new Error('Producing step is not registered in the caller\'s run')
    }
    const [inserted] = await tx.insert(artifacts)
      .values({
        producerStepId: reference.producerStepId,
        name: reference.name,
        ...metadata,
      })
      .onConflictDoNothing({ target: [artifacts.producerStepId, artifacts.name] })
      .returning({ id: artifacts.id })
    if (inserted) {
      return {
        id: inserted.id,
        created: true,
      }
    }
    const [updated] = await tx.update(artifacts)
      .set({
        ...metadata,
        updatedAt: sql`now()`,
      })
      .where(and(eq(artifacts.producerStepId, reference.producerStepId), eq(artifacts.name, reference.name)))
      .returning({ id: artifacts.id })
    return {
      id: updated!.id,
      created: false,
    }
  })
  return {
    record: (await findArtifactById(db, id))!,
    created,
  }
}

/**
 * Records matching exactly the given references, ordered by `createdAt`, then `id`.
 * @param db - Database containing artifacts and their producing steps.
 * @param references - Typically the caller's readable references; empty yields an empty list.
 * @returns Matching current records in deterministic creation order; no SAS URLs are issued.
 */
export async function listArtifactsByReferences(db: Database, references: readonly ArtifactRef[]): Promise<ArtifactRecord[]> {
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
}

/**
 * Record an upload report, replacing the state, size, hash and details; no history
 * is kept. A failure clears size and hash; omitted details are cleared. The caller
 * has already checked access.
 * @param db - Database containing the authorized artifact.
 * @param id - Validated artifact UUID whose latest outcome is replaced.
 * @param report - Validated uploaded or failed outcome; omitted details are cleared.
 * @returns The updated internal record with the replacement report and refreshed update timestamp.
 * @throws If the artifact no longer exists.
 */
export async function recordUploadReport(db: Database, id: string, report: CompleteArtifactRequest): Promise<ArtifactRecord> {
  const outcome = report.state === 'uploaded'
    ? {
      state: report.state,
      sizeBytes: report.sizeBytes,
      sha256: report.sha256,
    }
    : {
      state: report.state,
      sizeBytes: null,
      sha256: null,
    }
  const [updated] = await db.update(artifacts)
    .set({
      ...outcome,
      details: report.details ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(artifacts.id, id))
    .returning({ id: artifacts.id })
  if (!updated) {
    throw new Error('Artifact disappeared before its upload was recorded')
  }
  return (await findArtifactById(db, id))!
}
