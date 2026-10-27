// Handwritten HTTP metadata. Payload values come from the same data-only corpus
// used by contract tests; schema definitions remain in shared Zod modules.
import examples from '../../docs/api/examples.json' with { type: 'json' }

const noStoreHeaders = {
  'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
}

function example(id: string) {
  const found = examples.requests.find(example => example.id === id)
  if (!found) {
    throw new Error(`Unknown artifact documentation example: ${id}`)
  }
  return found
}

function jsonMedia(schema: string, value: unknown) {
  return {
    'application/json': {
      schema: { $ref: `#/components/schemas/${schema}` },
      examples: { example: { value } },
    },
  }
}
function response(schema: string, value: unknown, description = 'Success') {
  return { description, headers: noStoreHeaders, content: jsonMedia(schema, value) }
}
function requestBody(schema: string, value: unknown) {
  return { required: true, content: jsonMedia(schema, value) }
}
function errors(...statuses: number[]) {
  return Object.fromEntries(statuses.map(status => [status, { $ref: `#/components/responses/Error${status}` }]))
}

// The caller receives an independent tree through buildArtifactOpenApi().
// There is no filesystem access, server validation or test-runner dependency.
export function buildArtifactHttpContract() {
  const first = example('planner-registers-local-plan')
  const completed = example('planner-reports-upload-complete')
  const idParameter = [{
    name: 'id',
    in: 'path',
    required: true,
    schema: { $ref: '#/components/schemas/Uuid' },
    example: first.response.id,
  }]
  return {
    'openapi': '3.0.3',
    'info': {
      title: 'Artifact service contract',
      version: '0.3.1',
      description: 'One current artifact per producing step/name. Trusted middleware supplies event.context.caller; task policy and exact bindings determine access. Missing or no access is 404; some access but wrong action is 403. Planners write their own plan; coders read bound plans. Assume one plan per consumer, one active writer per step, and reads after production. No history or planner recovery. Unsupported methods return 405 with Allow. Generated contract; routes and integrations are not implemented.',
    },
    'x-caller-context': { location: 'event.context.caller', schema: { $ref: '#/components/schemas/CallerContext' } },
    'paths': {
      '/api/artifacts': {
        post: {
          operationId: 'createArtifact',
          summary: 'Create an upload SAS for a step-owned artifact',
          description: 'Register metadata if absent and issue a fresh upload SAS for the same ID/blob. First kind/title/description wins; later descriptive changes are ignored. Changed content type returns 409.',
          requestBody: requestBody('CreateArtifactRequest', first.body),
          responses: {
            200: response('CreateArtifactResponse', first.response),
            201: response('NewArtifactResponse', first.response, 'Created'),
            ...errors(400, 403, 404, 409, 413, 415, 500, 503),
          },
        },
        get: {
          operationId: 'listArtifacts',
          summary: 'Discover artifacts readable by the middleware-established caller',
          description: 'List readable reserved/uploaded metadata, ordered by createdAt then id ascending. Return an empty collection if none; never issue SAS URLs.',
          responses: {
            200: response('ListArtifactsResponse', example('coder-discovers-inputs').response),
            ...errors(400, 500, 503),
          },
        },
      },
      '/api/artifacts/{id}': {
        put: {
          operationId: 'completeArtifact',
          summary: 'Record the latest successful upload; retain no completion history',
          description: 'After Azure upload succeeds, report size and SHA-256. Every accepted report replaces the latest values and acknowledgment timestamps, including identical retries. Maximum reported size: 1,000,000 bytes; uploaded bytes are not verified.',
          parameters: idParameter,
          requestBody: requestBody('CompleteArtifactRequest', completed.body),
          responses: {
            200: response('CompleteArtifactResponse', completed.response),
            ...errors(400, 403, 404, 409, 413, 415, 500, 503),
          },
        },
        get: {
          operationId: 'getArtifact',
          summary: 'Read artifact metadata without generating a SAS URL',
          description: 'Return reserved or uploaded metadata without a SAS URL.',
          parameters: idParameter,
          responses: {
            200: response('ArtifactInfo', example('coder-reads-plan-metadata').response),
            ...errors(400, 403, 404, 500, 503),
          },
        },
      },
      '/api/artifacts/{id}/sas': {
        get: {
          operationId: 'getArtifactSas',
          summary: 'Receive a just-in-time download SAS URL',
          description: 'Issue a read SAS for the current blob; return 409 if upload has not been acknowledged.',
          parameters: idParameter,
          responses: {
            200: response('DownloadSas', example('coder-requests-download-url').response),
            ...errors(400, 403, 404, 409, 500, 503),
          },
        },
      },
    },
    'components': {
      responses: {
        Error400: response('Error400', examples.errors.Error400, 'INVALID_REQUEST'),
        Error403: response('Error403', examples.errors.Error403, 'The artifact exists within the caller\'s any-action scope, but the requested action is not permitted. Never use 403 for an unseen or missing artifact.'),
        Error404: response('Error404', examples.errors.Error404, 'Artifact is missing or outside the caller\'s any-action scope; do not disclose which.'),
        Error405: {
          ...response('Error405', examples.errors.Error405, 'METHOD_NOT_ALLOWED'),
          headers: { ...noStoreHeaders, Allow: { schema: { type: 'string', enum: ['GET, POST', 'GET, PUT', 'GET'] } } },
        },
        Error409: response('Error409', examples.errors.Error409, 'CONFLICT'),
        Error413: response('Error413', examples.errors.Error413, 'REQUEST_TOO_LARGE'),
        Error415: response('Error415', examples.errors.Error415, 'UNSUPPORTED_MEDIA_TYPE'),
        Error500: response('Error500', examples.errors.Error500, 'INTERNAL_ERROR'),
        Error503: response('Error503', examples.errors.Error503, 'CALLER_CONTEXT_UNAVAILABLE, DEPENDENCY_UNAVAILABLE'),
      },
    },
  } as const
}
