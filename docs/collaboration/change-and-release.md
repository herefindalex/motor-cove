# Change and release

This page defines local release evidence and separates it from remote repository settings.

Before merge, run the affected focused checks, generated-artifact drift, docs checks, formatting,
lint, type checks, architecture fixtures, contract/database/unit/integration/browser tests, and builds.
Record actual outcomes and limits; do not turn a skipped manual check into a pass.

ABI, API, DB, CLI, projector, deployment, or scenario changes also update consumer docs, command
annotations, recipes, implementation status, and verification records. Schema changes state data
preservation and restore. Projector changes state rebuild requirements. Deployment changes state
identity compatibility.

Recommended GitHub settings include required CI, resolved conversations, a protected default branch,
no force pushes, and real CODEOWNERS review. Each pushed revision needs its own docs smoke, verify,
and E2E result; the machine evidence record names the exact revision and run. Branch protection,
required reviews, and CODEOWNERS enforcement are separate owner-controlled settings that a successful
workflow run does not prove.

See [testing strategy](../testing/strategy.md) and [delivery workflow](delivery-workflow.md).
