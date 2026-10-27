// Handwritten HTTP contract: methods, paths, status codes and documentation.
// Data shapes are imported by the generator from shared/utils/zod-schemas/.
// Keep HTTP metadata here; do not edit the generated docs/api/artifact.openapi.json.
export const artifactHttpContract = {
  'openapi': '3.0.3',
  'info': {
    title: 'Artifact service contract',
    version: '0.3.1',
    description: 'Step-owned current artifacts: one ID/blob per producing step/name. Middleware supplies event.context.caller; authentication is outside this slice. Planner may create/update its own plan; consumers read after production. No attempts, revision history or overlapping-writer coordination. Generated from Zod schemas and TypeScript HTTP definitions; no routes or integrations are implemented.',
  },
  'x-caller-context': {
    location: 'event.context.caller',
    schema: {
      $ref: '#/components/schemas/CallerContext',
    },
  },
  'paths': {
    '/api/artifacts': {
      post: {
        operationId: 'createArtifact',
        summary: 'Create an upload SAS for a step-owned artifact',
        description: 'Precondition: trusted middleware has populated event.context.caller. Access is derived server-side; request fields cannot grant permissions. Contract only; no route is implemented. Artifact lookup uses the union of trusted read/create/update grants: missing or no access is 404; existing with some access but wrong action is 403. Discovery filters to readable records and returns an empty list when none are readable.',
        responses: {
          201: {
            description: 'Created',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/NewArtifactResponse',
                },
                examples: {
                  example: {
                    value: {
                      id: '40000000-0000-4000-8000-000000000001',
                      state: 'reserved',
                      upload: {
                        url: 'https://example.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sv=2023-11-03&spr=https&sr=b&sp=w&sig=DOCUMENTATION-ONLY',
                        method: 'PUT',
                        headers: {
                          'x-ms-blob-type': 'BlockBlob',
                          'Content-Type': 'text/markdown',
                        },
                        expiresAt: '2026-10-26T10:05:00Z',
                      },
                    },
                  },
                },
              },
            },
          },
          200: {
            description: 'Success',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CreateArtifactResponse',
                },
                examples: {
                  example: {
                    value: {
                      id: '40000000-0000-4000-8000-000000000001',
                      state: 'reserved',
                      upload: {
                        url: 'https://example.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sv=2023-11-03&spr=https&sr=b&sp=w&sig=DOCUMENTATION-ONLY',
                        method: 'PUT',
                        headers: {
                          'x-ms-blob-type': 'BlockBlob',
                          'Content-Type': 'text/markdown',
                        },
                        expiresAt: '2026-10-26T10:05:00Z',
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/Error400',
          },
          403: {
            $ref: '#/components/responses/Error403',
          },
          500: {
            $ref: '#/components/responses/Error500',
          },
          503: {
            $ref: '#/components/responses/Error503',
          },
          404: {
            $ref: '#/components/responses/Error404',
          },
          409: {
            $ref: '#/components/responses/Error409',
          },
          413: {
            $ref: '#/components/responses/Error413',
          },
          415: {
            $ref: '#/components/responses/Error415',
          },
        },
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateArtifactRequest',
              },
              examples: {
                example: {
                  value: {
                    name: 'plan',
                    contentType: 'text/markdown',
                    kind: 'notes',
                    title: 'Implementation plan',
                    description: 'Plan for the first artifact-service slice.',
                  },
                },
              },
            },
          },
        },
      },
      get: {
        operationId: 'listArtifacts',
        summary: 'Discover artifacts readable by the middleware-established caller',
        description: 'Precondition: trusted middleware has populated event.context.caller. Access is derived server-side; request fields cannot grant permissions. Contract only; no route is implemented. Artifact lookup uses the union of trusted read/create/update grants: missing or no access is 404; existing with some access but wrong action is 403. Discovery filters to readable records and returns an empty list when none are readable.',
        responses: {
          200: {
            description: 'Success',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ListArtifactsResponse',
                },
                examples: {
                  example: {
                    value: {
                      artifacts: [
                        {
                          id: '40000000-0000-4000-8000-000000000001',
                          name: 'plan',
                          contentType: 'text/markdown',
                          kind: 'notes',
                          title: 'Implementation plan',
                          description: 'Plan for the first artifact-service slice.',
                          state: 'uploaded',
                          createdAt: '2026-10-26T10:00:00Z',
                          sizeBytes: 5,
                          sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
                          uploadedAt: '2026-10-26T10:00:10Z',
                          updatedAt: '2026-10-26T10:00:10Z',
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/Error400',
          },
          500: {
            $ref: '#/components/responses/Error500',
          },
          503: {
            $ref: '#/components/responses/Error503',
          },
        },
      },
    },
    '/api/artifacts/{id}': {
      put: {
        operationId: 'completeArtifact',
        summary: 'Record the latest successful upload; retain no completion history',
        description: 'Precondition: trusted middleware has populated event.context.caller. Access is derived server-side; request fields cannot grant permissions. Contract only; no route is implemented. Artifact lookup uses the union of trusted read/create/update grants: missing or no access is 404; existing with some access but wrong action is 403. Discovery filters to readable records and returns an empty list when none are readable.',
        responses: {
          200: {
            description: 'Success',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CompleteArtifactResponse',
                },
                examples: {
                  example: {
                    value: {
                      id: '40000000-0000-4000-8000-000000000001',
                      state: 'uploaded',
                    },
                  },
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/Error400',
          },
          403: {
            $ref: '#/components/responses/Error403',
          },
          500: {
            $ref: '#/components/responses/Error500',
          },
          503: {
            $ref: '#/components/responses/Error503',
          },
          404: {
            $ref: '#/components/responses/Error404',
          },
          409: {
            $ref: '#/components/responses/Error409',
          },
          413: {
            $ref: '#/components/responses/Error413',
          },
          415: {
            $ref: '#/components/responses/Error415',
          },
        },
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              $ref: '#/components/schemas/Uuid',
            },
            example: '40000000-0000-4000-8000-000000000001',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CompleteArtifactRequest',
              },
              examples: {
                example: {
                  value: {
                    state: 'uploaded',
                    sizeBytes: 5,
                    sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
                  },
                },
              },
            },
          },
        },
      },
      get: {
        operationId: 'getArtifact',
        summary: 'Read artifact metadata without generating a SAS URL',
        description: 'Precondition: trusted middleware has populated event.context.caller. Access is derived server-side; request fields cannot grant permissions. Contract only; no route is implemented. Artifact lookup uses the union of trusted read/create/update grants: missing or no access is 404; existing with some access but wrong action is 403. Discovery filters to readable records and returns an empty list when none are readable.',
        responses: {
          200: {
            description: 'Success',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ArtifactInfo',
                },
                examples: {
                  example: {
                    value: {
                      id: '40000000-0000-4000-8000-000000000001',
                      name: 'plan',
                      contentType: 'text/markdown',
                      kind: 'notes',
                      title: 'Implementation plan',
                      description: 'Plan for the first artifact-service slice.',
                      state: 'uploaded',
                      createdAt: '2026-10-26T10:00:00Z',
                      sizeBytes: 5,
                      sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
                      uploadedAt: '2026-10-26T10:00:10Z',
                      updatedAt: '2026-10-26T10:00:10Z',
                    },
                  },
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/Error400',
          },
          403: {
            $ref: '#/components/responses/Error403',
          },
          500: {
            $ref: '#/components/responses/Error500',
          },
          503: {
            $ref: '#/components/responses/Error503',
          },
          404: {
            $ref: '#/components/responses/Error404',
          },
          409: {
            $ref: '#/components/responses/Error409',
          },
        },
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              $ref: '#/components/schemas/Uuid',
            },
            example: '40000000-0000-4000-8000-000000000001',
          },
        ],
      },
    },
    '/api/artifacts/{id}/sas': {
      get: {
        operationId: 'getArtifactSas',
        summary: 'Receive a just-in-time download SAS URL',
        description: 'Precondition: trusted middleware has populated event.context.caller. Access is derived server-side; request fields cannot grant permissions. Contract only; no route is implemented. Artifact lookup uses the union of trusted read/create/update grants: missing or no access is 404; existing with some access but wrong action is 403. Discovery filters to readable records and returns an empty list when none are readable.',
        responses: {
          200: {
            description: 'Success',
            headers: {
              'Cache-Control': {
                schema: {
                  type: 'string',
                  enum: [
                    'no-store',
                  ],
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/DownloadSas',
                },
                examples: {
                  example: {
                    value: {
                      url: 'https://example.blob.core.windows.net/artifacts/v1/runs/10000000-0000-4000-8000-000000000001/steps/20000000-0000-4000-8000-000000000001/artifacts/plan?sv=2023-11-03&spr=https&sr=b&sp=r&sig=DOCUMENTATION-ONLY',
                      method: 'GET',
                      expiresAt: '2026-10-26T10:05:00Z',
                    },
                  },
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/Error400',
          },
          403: {
            $ref: '#/components/responses/Error403',
          },
          500: {
            $ref: '#/components/responses/Error500',
          },
          503: {
            $ref: '#/components/responses/Error503',
          },
          404: {
            $ref: '#/components/responses/Error404',
          },
          409: {
            $ref: '#/components/responses/Error409',
          },
        },
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              $ref: '#/components/schemas/Uuid',
            },
            example: '40000000-0000-4000-8000-000000000001',
          },
        ],
      },
    },
  },
  'components': {
    responses: {
      Error400: {
        description: 'INVALID_REQUEST',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error400',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'INVALID_REQUEST',
                    message: 'invalid request',
                    fields: [
                      {
                        path: '/id',
                        code: 'format',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      Error403: {
        description: 'The artifact exists within the caller\'s any-action scope, but the requested action is not permitted. Never use 403 for an unseen or missing artifact.',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error403',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'FORBIDDEN',
                    message: 'forbidden',
                  },
                },
              },
            },
          },
        },
      },
      Error404: {
        description: 'Artifact is missing or outside the caller\'s any-action scope; do not disclose which.',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error404',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'ARTIFACT_NOT_FOUND',
                    message: 'artifact not found',
                  },
                },
              },
            },
          },
        },
      },
      Error405: {
        description: 'METHOD_NOT_ALLOWED',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
          'Allow': {
            schema: {
              type: 'string',
              enum: [
                'GET, POST',
                'GET, PUT',
                'GET',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error405',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'METHOD_NOT_ALLOWED',
                    message: 'method not allowed',
                  },
                },
              },
            },
          },
        },
      },
      Error409: {
        description: 'CONFLICT',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error409',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'CONFLICT',
                    message: 'conflict',
                  },
                },
              },
            },
          },
        },
      },
      Error413: {
        description: 'REQUEST_TOO_LARGE',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error413',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'REQUEST_TOO_LARGE',
                    message: 'request too large',
                  },
                },
              },
            },
          },
        },
      },
      Error415: {
        description: 'UNSUPPORTED_MEDIA_TYPE',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error415',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: 'unsupported media type',
                  },
                },
              },
            },
          },
        },
      },
      Error500: {
        description: 'INTERNAL_ERROR',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error500',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'internal error',
                  },
                },
              },
            },
          },
        },
      },
      Error503: {
        description: 'CALLER_CONTEXT_UNAVAILABLE, DEPENDENCY_UNAVAILABLE',
        headers: {
          'Cache-Control': {
            schema: {
              type: 'string',
              enum: [
                'no-store',
              ],
            },
          },
        },
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error503',
            },
            examples: {
              example: {
                value: {
                  error: {
                    code: 'CALLER_CONTEXT_UNAVAILABLE',
                    message: 'caller context unavailable',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const
