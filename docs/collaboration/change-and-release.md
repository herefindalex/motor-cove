# Change and release

This page defines local release evidence and separates it from remote repository settings.

Before merge, run the affected focused checks, generated-artifact drift, docs checks, formatting,
lint, type checks, architecture fixtures, contract/database/unit/integration/browser tests, and builds.
Record actual outcomes and limits; do not turn a skipped manual check into a pass.

ABI, API, DB, CLI, projector, deployment, or scenario changes also update consumer docs, command
annotations, recipes, implementation status, and verification records. Schema changes state data
preservation and restore. Projector changes state rebuild requirements. Deployment changes state
identity compatibility.

Recommended GitHub settings include required CI, resolved conversations, protected default branch,
no force pushes, and real CODEOWNERS review. None were inspected or modified in this task. A workflow
file and local pass do not prove a remote run or branch rule.

See [testing strategy](../testing/strategy.md) and [delivery workflow](delivery-workflow.md).
