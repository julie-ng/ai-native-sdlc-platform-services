# Artifact API

One current file and metadata record per producing step/name. Retries and later executions reuse the artifact ID and blob; bytes transfer directly between callers and Azure Blob Storage.

Routes, service, PostgreSQL repository and Azure SAS issuer are implemented. Nothing sets the caller context yet: until the `requireCallerContext` guard authenticates callers (#13), every artifact request returns 503 (see [open decisions](../architecture.md#open-decisions)).

## Operations

| Request | Result |
| --- | --- |
| `POST /api/artifacts` | Register or re-register the caller's artifact and issue an upload SAS. 201 for a new artifact; otherwise 200. |
| `PUT <upload SAS URL>` | Upload or overwrite directly in Azure. |
| `PUT /api/artifacts/{id}` | Report the upload outcome: `uploaded` with size and SHA-256, or `failed`; optional `details`. Returns 200. |
| `GET /api/artifacts` | List readable metadata. Returns 200, possibly an empty list. |
| `GET /api/artifacts/{id}` | Read metadata in any state. Returns 200. |
| `GET /api/artifacts/{id}/sas` | Issue a download SAS. Returns 200; 409 unless the latest report is a successful upload. |
| `GET <download SAS URL>` | Download directly from Azure. |

## Access policy

The `requireCallerContext` guard, called explicitly by every artifact route, establishes caller context; task policy and exact workflow bindings determine access. An artifact ID or claimed role grants nothing.

| Caller | Permitted operations |
| --- | --- |
| Planner | Create/overwrite its own bound `plan` and report uploads. No metadata or download access. |
| Coder | Discover, inspect, and download bound plans. No writes. |
| Other task types | No access. |

- A different step does not inherit ownership, even with the same task type.
- Missing artifact, or not visible (no granted action): 404. Visible but wrong action: 403. For example, a planner reading its own plan, or a coder reporting an upload.
- Write responses contain acknowledgments, not stored metadata. Metadata/list responses never contain SAS URLs.

## Upload lifecycle

1. Write the local file and POST its name/content type, with optional kind/title/description.
2. Upload using the returned SAS URL and headers.
3. Report the outcome to the artifact endpoint: after Azure succeeds, PUT `state: uploaded`, `sizeBytes` and `sha256`; if the upload fails, PUT `state: failed`. Either may include `details`, free text such as a short summary of the failure.
4. Consumers discover the artifact, request a download SAS, and fetch the file.

Repeated POSTs replace the descriptive metadata (last write wins; omitted optional fields are cleared) and issue a fresh SAS for the same artifact. State, size and hash are unchanged until the next upload report.

| State | Meaning | Size and hash | Download |
| --- | --- | --- | --- |
| `reserved` | Registered; no upload reported yet | No | 409 |
| `uploaded` | Latest report: upload succeeded | Yes | 200 |
| `failed` | Latest report: upload failed | No | 409 |

Each upload report replaces the state, size, hash and details (omitted details are cleared); the last report wins, with no history. A failure after an earlier successful upload therefore makes downloads 409 until the next successful report, even though Azure keeps the previous blob. Reported size is limited to **1 MB (1,000,000 bytes)**; the service does not verify uploaded bytes or enforce their actual size.

## POC assumptions

- One plan per consumer; no cardinality checks. Discovery remains a collection.
- One active writer per step; consumers read after production. No artifact history, version selection, or overlapping-writer coordination.
- Planners retain their local file or regenerate it; they cannot recover previous output through this API.
- Metadata describes the last reported upload. Overwriting bytes and reporting them are separate operations; SAS URLs remain usable until expiry.

## References

- [Implementation contract](./implementation.md): validation, persistence, storage, and schema workflow.
- [OpenAPI](./artifact.openapi.json): generated request/response shapes.
