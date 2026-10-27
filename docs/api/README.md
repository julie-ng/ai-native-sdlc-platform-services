# Artifact API

One current file and metadata record per producing step/name. Retries and later executions reuse the artifact ID and blob; bytes transfer directly between callers and Azure Blob Storage.

Schemas, caller-context validation, policy utilities, and adapter interfaces exist. Routes, service orchestration, database migrations, and Azure adapters are not implemented.

## Operations

| Request | Result |
| --- | --- |
| `POST /api/artifacts` | Register metadata if absent and issue an upload SAS. 201 for a new artifact; otherwise 200. |
| `PUT <upload SAS URL>` | Upload or overwrite directly in Azure. |
| `PUT /api/artifacts/{id}` | Report successful upload: size and SHA-256. Returns 200. |
| `GET /api/artifacts` | List readable metadata. Returns 200, possibly an empty list. |
| `GET /api/artifacts/{id}` | Read reserved or uploaded metadata. Returns 200. |
| `GET /api/artifacts/{id}/sas` | Issue a download SAS. Returns 200; 409 if upload is not acknowledged. |
| `GET <download SAS URL>` | Download directly from Azure. |

## Access policy

Trusted middleware supplies caller context; task policy and exact workflow bindings determine access. An artifact ID or claimed role grants nothing.

| Caller | Permitted operations |
| --- | --- |
| Planner | Create/overwrite its own bound `plan` and report completion. No metadata or download access. |
| Coder | Discover, inspect, and download bound plans. No writes. |
| Other task types | No access. |

- A different step does not inherit ownership, even with the same task type.
- Missing artifact or no access: 404. Some access but wrong action: 403.
- Write responses contain acknowledgments, not stored metadata. Metadata/list responses never contain SAS URLs.
- Authentication is separate; its open choice is recorded in [architecture](../architecture.md#open-decisions).

## Upload lifecycle

1. Write the local file and POST its name/content type, with optional kind/title/description.
2. Upload using the returned SAS and headers.
3. After Azure succeeds, PUT `state: uploaded`, `sizeBytes`, and `sha256` to the artifact endpoint.
4. Consumers discover the artifact, request a download SAS, and fetch the file.

First descriptive metadata wins. Repeated POSTs ignore changes to kind/title/description; a changed content type is 409. Every permitted POST issues a fresh SAS for the same artifact without changing existing metadata or state.

Each completion report replaces the latest size/hash and acknowledgment timestamps. Reported size is limited to **1 MB (1,000,000 bytes)**; the service does not verify uploaded bytes or enforce their actual size.

## POC assumptions

- One plan per consumer; no cardinality checks. Discovery remains a collection.
- One active writer per step; consumers read after production. No artifact history, version selection, or overlapping-writer coordination.
- Planners retain their local file or regenerate it; they cannot recover previous output through this API.
- Metadata describes the last acknowledged upload. Overwriting bytes and recording completion are separate operations; SAS URLs remain usable until expiry.

## References

- [Implementation contract](./implementation.md): validation, persistence, storage, and schema workflow.
- [OpenAPI](./artifact.openapi.json): generated request/response shapes.
- [Examples](./examples.json) and [caller fixtures](./caller-contexts.fixture.json): checked test data. Multiple-plan fixtures exercise collection behavior, not a POC requirement.
