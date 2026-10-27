// Test-only server-owned contexts and records. Never import these into production wiring.
import type { ArtifactRef, CallerContext, UploadedArtifact } from '../../server/utils/artifact/ports.ts'

export const runA = '10000000-0000-4000-8000-000000000001'
export const runB = '10000000-0000-4000-8000-000000000002'
export const stepIds = {
  plannerP1: '20000000-0000-4000-8000-000000000001',
  coderC1: '20000000-0000-4000-8000-000000000002',
  plannerP2: '20000000-0000-4000-8000-000000000003',
  coderC2: '20000000-0000-4000-8000-000000000004',
  plannerRunB: '20000000-0000-4000-8000-000000000005',
} as const

export const planP1: ArtifactRef = { runId: runA, producerStepId: stepIds.plannerP1, name: 'plan' }
export const planP2: ArtifactRef = { runId: runA, producerStepId: stepIds.plannerP2, name: 'plan' }
export const planRunB: ArtifactRef = { runId: runB, producerStepId: stepIds.plannerRunB, name: 'plan' }
export const otherP1: ArtifactRef = { runId: runA, producerStepId: stepIds.plannerP1, name: 'other' }

export const contexts = {
  'planner-p1': { runId: runA, stepId: stepIds.plannerP1, taskType: 'planner', inputs: [], outputs: [planP1] },
  // A retry or later execution of P1 receives the same logical step context.
  'planner-p1-later-execution': { runId: runA, stepId: stepIds.plannerP1, taskType: 'planner', inputs: [], outputs: [planP1] },
  'planner-p2': { runId: runA, stepId: stepIds.plannerP2, taskType: 'planner', inputs: [], outputs: [planP2] },
  'coder-c1': { runId: runA, stepId: stepIds.coderC1, taskType: 'coder', inputs: [planP1], outputs: [] },
  // Collection behavior only; the POC assumes one plan per consumer.
  'coder-multiple-inputs': { runId: runA, stepId: stepIds.coderC2, taskType: 'coder', inputs: [planP1, planP2], outputs: [] },
  'coder-no-inputs': { runId: runA, stepId: stepIds.coderC1, taskType: 'coder', inputs: [], outputs: [] },
  'unknown-task': { runId: runA, stepId: stepIds.coderC1, taskType: 'unrecognized', inputs: [planP1], outputs: [] },
} satisfies Record<string, CallerContext>

// Workflow-owned rows that artifact persistence tests seed before inserting artifacts.
export const workflowRecords = {
  runs: [{ id: runA }, { id: runB }],
  steps: [
    { id: stepIds.plannerP1, runId: runA },
    { id: stepIds.coderC1, runId: runA },
    { id: stepIds.plannerP2, runId: runA },
    { id: stepIds.coderC2, runId: runA },
    { id: stepIds.plannerRunB, runId: runB },
  ],
}

export function uploadedRecord(id: string, reference: ArtifactRef): UploadedArtifact {
  return {
    id,
    reference: { ...reference },
    metadata: { contentType: 'text/markdown' },
    state: 'uploaded',
    sizeBytes: 5,
    sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:01:00.000Z',
  }
}
