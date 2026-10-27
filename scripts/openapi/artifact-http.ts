// Handwritten HTTP metadata. Schema definitions remain in shared Zod modules;
// examples here are documentation only, not test data.
const artifactId = '40000000-0000-4000-8000-000000000001'
const examples = {
  createRequest: { name: 'plan', contentType: 'text/markdown', title: 'Implementation plan' },
  createResponse: {
    id: artifactId,
    state: 'reserved',
    upload: {
      url: `https://account.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sp=w&sig=DOCUMENTATION-ONLY`,
      method: 'PUT',
      expiresAt: '2026-10-27T10:05:00.000Z',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'text/markdown' },
    },
  },
  completeRequest: { state: 'uploaded', sizeBytes: 5, sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3' },
  completeResponse: { id: artifactId, state: 'uploaded' },
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
  'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
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
  return { description, ...(headers ? { headers } : {}), content: jsonMedia(schema, value) }
}
function requestBody(schema: string, value: unknown) {
  return { required: true, content: jsonMedia(schema, value) }
}
const errorDescriptions: Record<number, string> = {
  400: 'Invalid body or route parameter; `data` holds z.flattenError() output',
  403: 'Artifact is visible to the caller, but the requested action is not permitted',
  404: 'Artifact is missing or not visible to the caller; the two are indistinguishable',
  409: 'Download requested before an upload was reported',
  500: 'Unexpected database or storage failure',
  503: 'Caller context unavailable, or the service is not configured',
}
function errors(...statuses: number[]) {
  return Object.fromEntries(statuses.map(status => [status, { description: errorDescriptions[status], content: jsonMedia('ErrorResponse') }]))
}

// The caller receives an independent tree through buildArtifactOpenApi().
// There is no filesystem access, server validation or test-runner dependency.
export function buildArtifactHttpContract() {
  const idParameter = [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { $ref: '#/components/schemas/Uuid' },
    example: artifactId,
  }]
  return {
    'openapi': '3.0.3',
    'info': {
      title: 'Artifact service contract',
      version: '0.4.0',
      description: 'One current artifact per producing step/name. Trusted middleware supplies event.context.caller; task policy and exact bindings determine access. Missing or not visible is 404; visible but wrong action is 403. Planners write their own plan; coders read bound plans. Bytes move directly between caller and Azure Blob Storage. Errors use Nitro\'s createError() JSON.',
    },
    'x-caller-context': { location: 'event.context.caller', schema: { $ref: '#/components/schemas/CallerContext' } },
    'paths': {
      '/api/artifacts': {
        post: {
          operationId: 'createArtifact',
          summary: 'Register the caller\'s artifact and issue an upload SAS',
          description: 'Insert, or replace the descriptive metadata of, the caller\'s step/name artifact (last write wins; omitted optional fields are cleared). State, size and hash are kept. Every call issues a fresh write SAS for the same blob.',
          requestBody: requestBody('CreateArtifactRequest', examples.createRequest),
          responses: {
            200: response('CreateArtifactResponse', { ...examples.createResponse, state: 'uploaded' }, 'Existing artifact', noStoreHeaders),
            201: response('NewArtifactResponse', examples.createResponse, 'Created', noStoreHeaders),
            ...errors(400, 403, 404, 500, 503),
          },
        },
        get: {
          operationId: 'listArtifacts',
          summary: 'Discover artifacts readable by the caller',
          description: 'List readable reserved/uploaded metadata, ordered by createdAt then id ascending. Possibly empty; never issues SAS URLs.',
          responses: {
            200: response('ListArtifactsResponse', { artifacts: [examples.info] }),
            ...errors(500, 503),
          },
        },
      },
      '/api/artifacts/{id}': {
        put: {
          operationId: 'completeArtifact',
          summary: 'Report a successful upload',
          description: 'After Azure accepts the upload, report its size and SHA-256. Each report replaces the latest values; no history. Uploaded bytes are not verified. Maximum reported size: 1,000,000 bytes.',
          parameters: idParameter,
          requestBody: requestBody('CompleteArtifactRequest', examples.completeRequest),
          responses: {
            200: response('CompleteArtifactResponse', examples.completeResponse),
            ...errors(400, 403, 404, 500, 503),
          },
        },
        get: {
          operationId: 'getArtifact',
          summary: 'Read artifact metadata without issuing a SAS URL',
          parameters: idParameter,
          responses: {
            200: response('ArtifactInfo', examples.info),
            ...errors(400, 403, 404, 500, 503),
          },
        },
      },
      '/api/artifacts/{id}/sas': {
        get: {
          operationId: 'getArtifactSas',
          summary: 'Issue a just-in-time download SAS URL',
          description: 'Issue a read SAS for the current blob; 409 until an upload has been reported.',
          parameters: idParameter,
          responses: {
            200: response('DownloadSas', examples.download, 'Success', noStoreHeaders),
            ...errors(400, 403, 404, 409, 500, 503),
          },
        },
      },
    },
    'components': {},
  } as const
}
