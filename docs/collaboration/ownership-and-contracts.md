# Ownership and contracts

This page identifies provider surfaces and required consumer review. Roles may be held by one person;
the separation still prevents hidden contract changes.

| Workstream | Owns                                                  | Publishes                                                     | Affected consumers                  |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| Frontend   | Features, capabilities, UI adapters                   | UI states, operation intent, consumer expectations            | QA, product demo                    |
| Protocol   | Solidity and deployment behavior                      | ABI, events, errors, manifest semantics                       | Frontend, Indexer, database/release |
| API        | Query modules and HTTP wire format                    | Zod/OpenAPI, examples, provenance                             | Frontend, QA                        |
| Indexer    | RPC ingestion, decoder, projectors                    | Source scope, projector version, checkpoint/recovery behavior | Database, API, operations           |
| Database   | Schema, migrations, reader/writer/maintenance exports | SQL history, schema contract, environment/lock rules          | Indexer, API, tooling, QA           |
| QA/tooling | Cross-layer scenarios and local gates                 | Acceptance evidence and failure reports                       | All providers and release owner     |

A provider change requires review by every affected consumer. CODEOWNERS can route review but cannot
prove that all provider-consumer acceptance gates passed. Real GitHub identities have not been
provided, so `.github/CODEOWNERS` intentionally does not invent owners.

See [delivery workflow](delivery-workflow.md) and [change recipes](../onboarding/change-recipes.md).
