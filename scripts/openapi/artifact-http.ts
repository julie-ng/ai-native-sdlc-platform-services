// Handwritten HTTP metadata. Schema definitions remain in shared Zod modules;
// examples here are documentation only, not test data.
const artifactId = '40000000-0000-4000-8000-000000000001'
const examples = {
  createRequest: {
    name: 'plan',
    contentType: 'text/markdown',
    title: 'Implementation plan',
  },
  createResponse: {
    id: artifactId,
    state: 'reserved',
    upload: {
      url: `https://account.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sp=w&sig=DOCUMENTATION-ONLY`,
      method: 'PUT',
      expiresAt: '2026-10-27T10:05:00.000Z',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'text/markdown',
      },
    },
  },
  completeRequest: {
    state: 'uploaded',
    sizeBytes: 5,
    sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
  },
  completeResponse: {
    id: artifactId,
    state: 'uploaded',
  },
  info: {
    id: artifactId,
    name: 'plan',
    contentType: 'text/markdown',
    title: 'Implementation plan',
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:01:00.000Z',
    state: 'uploaded',
    sizeBytes: 5,
    sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
  },
  download: {
    url: `https://account.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sp=r&sig=DOCUMENTATION-ONLY`,
    method: 'GET',
    expiresAt: '2026-10-27T10:05:00.000Z',
  },
}

const noStoreHeaders = {
  'Cache-Control': {
    schema: {
      type: 'string',
      enum: ['no-store'],
    },
  },
}

function jsonMedia(schema: string, value?: unknown) {
  return {
    'application/json': {
      schema: { $ref: `#/components/schemas/${schema}` },
      ...(value === undefined ? {} : { example: value }),
    },
  }
}
function response(schema: string, value: unknown, description = 'Success', headers?: object) {
  return {
    description,
    ...(headers ? { headers } : {}),
    content: jsonMedia(schema, value),
  }
}
function requestBody(schema: string, value: unknown) {
  return {
    required: true,
    content: jsonMedia(schema, value),
  }
}
const errorDescriptions: Record<number, string> = {
  400: 'Invalid body or route parameter; `data` holds z.flattenError() output',
  401: 'Missing, malformed, expired or invalid credentials; always a generic Unauthorized response',
  403: 'Artifact is visible to the caller, but the requested action is not permitted',
  404: 'Artifact is missing or not visible to the caller; the two are indistinguishable',
  409: 'Download requested while the latest report is not a successful upload',
  500: 'Unexpected database or storage failure',
  503: 'Authentication or artifact service is not configured',
}
function errors(...statuses: number[]) {
  return Object.fromEntries(statuses.map(status => [
    status,
    {
      description: errorDescriptions[status],
      content: jsonMedia('ErrorResponse'),
    },
  ]))
}

// Operations are tagged by resource; documentation tools such as the docs site group them by tag.
const artifactTags = ['Artifacts']

// The caller receives an independent tree through buildArtifactOpenApi().
// There is no filesystem access, server validation or test-runner dependency.
export function buildArtifactHttpContract() {
  const stepParameters = ['X-Run-Id', 'X-Step-Id'].map(name => ({
    name,
    in: 'header',
    required: true,
    schema: { $ref: '#/components/schemas/Uuid' },
  }))
  const idParameter = [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { $ref: '#/components/schemas/Uuid' },
      example: artifactId,
    },
  ]
  return {
    'openapi': '3.0.3',
    'info': {
      title: 'Artifact service contract',
      version: '0.6.0',
      description: 'One current artifact per producing step/name. The explicit requireStepContext guard establishes event.context.step; role policy and exact bindings determine access. Missing or not visible is 404; visible but wrong action is 403. Planners write their own plan; coders read bound plans. Bytes move directly between caller and Azure Blob Storage. Errors use Nitro\'s createError() JSON.',
    },
    'x-step-context': {
      location: 'event.context.step',
      schema: { $ref: '#/components/schemas/StepContext' },
    },
    'security': [{ StepBearer: [] }],
    'paths': {
      '/api/runs': {
        post: {
          operationId: 'createRun',
          tags: ['Runs'],
          summary: 'Create a planner/coder run and issue step credentials',
          description: 'Admin-only. No request body is consumed. Creates one planner and one coder atomically. Both opaque HMAC tokens expire at expiresAt, measured from stored run creation (default 15 minutes). The signing key stays server-side.',
          security: [{ AdminBearer: [] }],
          responses: {
            201: response('CreateRunResponse', {
              runId: '10000000-0000-4000-8000-000000000001',
              expiresAt: '2026-11-10T10:15:00.000Z',
              steps: {
                planner: {
                  stepId: '20000000-0000-4000-8000-000000000001',
                  token: 'a'.repeat(64),
                },
                coder: {
                  stepId: '20000000-0000-4000-8000-000000000002',
                  token: 'b'.repeat(64),
                },
              },
            }, 'Created', noStoreHeaders),
            ...errors(401, 500, 503),
          },
        },
      },
      '/api/artifacts': {
        post: {
          operationId: 'createArtifact',
          parameters: stepParameters,
          tags: artifactTags,
          summary: 'Create artifact and upload SAS',
          description: 'Insert, or replace the descriptive metadata of, the caller\'s step/name artifact (last write wins; omitted optional fields are cleared). State, size and hash are kept. Every call issues a fresh write SAS for the same blob.',
          requestBody: requestBody('CreateArtifactRequest', examples.createRequest),
          responses: {
            200: response('CreateArtifactResponse', {
              ...examples.createResponse,
              state: 'uploaded',
            }, 'Existing artifact', noStoreHeaders),
            201: response('NewArtifactResponse', examples.createResponse, 'Created', noStoreHeaders),
            ...errors(401, 400, 403, 404, 500, 503),
          },
        },
        get: {
          operationId: 'listArtifacts',
          parameters: stepParameters,
          tags: artifactTags,
          summary: 'List artifacts',
          description: 'List readable metadata in any state, ordered by createdAt then id ascending. Possibly empty; never issues SAS URLs.',
          responses: {
            200: response('ListArtifactsResponse', { artifacts: [examples.info] }),
            ...errors(401, 500, 503),
          },
        },
      },
      '/api/artifacts/{id}': {
        put: {
          operationId: 'completeArtifact',
          tags: artifactTags,
          summary: 'Update upload status',
          description: 'Report the outcome of the direct upload to Azure: `uploaded` with its size and SHA-256, or `failed`. Optional `details` carry free text, for example a short summary of why the upload failed. Each report replaces the previous state, size, hash and details (omitted details are cleared); no history. Uploaded bytes are not verified. Maximum reported size: 1,000,000 bytes.',
          parameters: [...stepParameters, ...idParameter],
          requestBody: requestBody('CompleteArtifactRequest', examples.completeRequest),
          responses: {
            200: response('CompleteArtifactResponse', examples.completeResponse),
            ...errors(400, 401, 403, 404, 500, 503),
          },
        },
        get: {
          operationId: 'getArtifact',
          tags: artifactTags,
          summary: 'Read artifact (without SAS)',
          parameters: [...stepParameters, ...idParameter],
          responses: {
            200: response('ArtifactInfo', examples.info),
            ...errors(400, 401, 403, 404, 500, 503),
          },
        },
      },
      '/api/artifacts/{id}/sas': {
        get: {
          operationId: 'getArtifactSas',
          tags: artifactTags,
          summary: 'Request download SAS URL',
          description: 'Issue a read SAS for the current blob; 409 unless the latest report is a successful upload.',
          parameters: [...stepParameters, ...idParameter],
          responses: {
            200: response('DownloadSas', examples.download, 'Success', noStoreHeaders),
            ...errors(400, 401, 403, 404, 409, 500, 503),
          },
        },
      },
    },
    'components': {
      securitySchemes: {
        StepBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Opaque HMAC-SHA256 hex token issued by POST /api/runs; requires X-Run-Id and X-Step-Id.',
        },
        AdminBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Server-configured admin token, used only to create runs.',
        },
      },
    },
  } as const
}
