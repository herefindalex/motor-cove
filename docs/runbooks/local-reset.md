# How to reset a disposable local demo

Reset is a destructive local operation, not migration, seed, rebuild, or restore.

## Guard sequence

1. Confirm local mode, loopback RPC, Anvil client, expected chain, and owned environment marker.
2. Resolve real paths, reject symlinks/external paths, then acquire bootstrap lifecycle ownership,
   the exclusive service gate, and the exclusive writer lock in that order.
3. After acquiring the gates, re-run `lstat` and `realpath` containment checks for `databaseDir` and
   `reportsDir`. Reject a missing, non-directory, symlinked, or external child before publishing a
   marker or calling the chain.
4. Publish `RESET / PREPARED`, then call `anvil_reset` while the same operation owns those gates.
5. Publish `CHAIN_RESET`, recheck the destructive child paths, remove generated database and
   lifecycle sidecars, publish
   `LOCAL_STATE_CLEARED`, then clear the marker.
6. Preserve lock files, backups, source assets, managed-node binding, and other workspaces.
7. Recreate a genuinely new deployment, then migrate, seed, index, and verify it.

`--yes` cannot bypass any identity or path guard. Reset must not kill unknown processes, delete stable
lock inodes, or pretend a new manifest ID is a new on-chain deployment.

Lifecycle ownership and the durable `PREPARED` marker both precede `anvil_reset`. A bootstrap that is
deploying or waiting for a seed receipt therefore blocks reset before any chain or environment
mutation. Reset releases the maintenance locks before lifecycle ownership; bootstrap uses the same
outer-to-inner order.

If reset stops in `PREPARED`, the chain result is unknown. `ops:recover --complete` reports
`ACTION_REQUIRED / RERUN_MATCHING_RESET` and retains both marker and local state. If the marker proves
`CHAIN_RESET`, recovery finishes idempotent local cleanup; it never clears the marker merely because
the old database still passes schema verification. Do not delete the marker or manually mix old
sidecars with the reset chain.

`MOTORCOVE_ENV=<id> pnpm demo:reset -- --yes` applies these guards. Use it only for a disposable
owned environment. Automated CLI cases prove that `--yes` still refuses a non-loopback RPC URL,
chain ID other than 31337, and a client that does not identify as Anvil. Reset coverage also preserves
lock inodes and backups. A real `flock` case proves bootstrap ownership prevents `anvil_reset` until
the owner exits. A child-process `SIGKILL` case proves the durable marker precedes a controlled chain
side effect; the full managed-node integration executes real Anvil reset without fault injection.
These checks do not prove hardware power-loss behavior or resistance to a malicious process
impersonating Anvil on loopback.

## Managed node ownership

Every managed environment must have a `managed-node.json` binding created by bootstrap. The binding
normalizes `localhost`, `127.0.0.1`, and `::1` for the same port to one node identity. Indexer startup
and reset refuse to continue when the binding is missing, conflicts with another environment, or
does not match the configured RPC endpoint.

Reset verifies this ownership before calling `anvil_reset`. It preserves the binding while removing
the generated database, deployment, bootstrap, seed, and report state. Start a separate local Anvil
endpoint for each managed environment; changing only the hostname alias does not create a separate
node.

The post-lock child-path check closes the gap between initial environment ownership validation and
destructive use. If another process replaces either generated directory with a symlink, reset stops
before the chain callback and preserves both the external target and the absence of a new maintenance
marker.
