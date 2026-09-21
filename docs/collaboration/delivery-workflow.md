# Delivery workflow

This page demonstrates a provider-consumer work package and reusable async handoff. It is a planning
model, not a claim that a real team executed this schedule.

## Example work package: SALE-002 fund sale

| Stage                   | Provider                     | Consumer or parallel work                                   | Hard exit gate                                                   |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Interface and behavior  | Protocol                     | Frontend can build typed state with an ABI fixture          | Exact payment, seller exclusion, event fields, and errors agreed |
| Consumer development    | Frontend + Indexer           | UI states and decoder/projector can proceed in parallel     | Provider artifact hash recorded; mocks labelled                  |
| Real deployment         | Protocol/tooling             | API config and browser deployment validation                | Manifest matches getter, code, ABI, and blocks                   |
| Data integration        | Indexer/database             | API presenter and Inspector consume a fixed reader contract | Atomic source/projection/checkpoint behavior verified            |
| End-to-end verification | QA                           | Docs/evidence may be prepared but not marked passed         | Real Anvil + SQLite + API + browser assertions pass              |
| Release readiness       | Owners of affected contracts | All consumers review compatibility and recovery             | Generated artifacts, migrations, runbooks, and evidence current  |

Mock ABI and API fixtures unblock independent work. They do not satisfy the deployment or real-chain
gates.

## Async handoff template

```text
Current state and source revision:
Changed contract or artifact:
Affected consumers:
Ready for independent work:
Blocked work and reason:
Evidence available:
Next owner action and acceptance gate:
Decision required:
```

## Blocker handling

Name the missing provider artifact or authority, the work that can continue, and the evidence needed
to unblock. Do not convert a mock success into integration completion. Escalate incompatible ABI,
API, DB, projector, or deployment identity changes to all provider and consumer owners.

## Planning example

Align work with existing P0–P5, D0–D5, and DOC-P0–P5 milestones. A slice can include protocol tests,
frontend states, database migration, and docs in parallel when their interfaces are explicit. No
velocity, staffing level, historical sprint result, or mentoring event is asserted.

See [parallel development](parallel-development.md) and [change and release](change-and-release.md).
