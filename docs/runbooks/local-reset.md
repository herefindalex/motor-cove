# How to reset a disposable local demo

Reset is a destructive local operation, not migration, seed, rebuild, or restore.

## Guard sequence

1. Confirm local mode, loopback RPC, Anvil client, expected chain, and owned environment marker.
2. Resolve real paths, reject symlinks/external paths, then acquire bootstrap lifecycle ownership,
   the exclusive service gate, and the exclusive writer lock in that order.
3. Explain that catalog edits and demo chain history will be discarded; require explicit confirmation.
4. Preserve lock files, backups, source assets, and other workspaces.
5. Recreate a genuinely new deployment, then migrate, seed, index, and verify it.

`--yes` cannot bypass any identity or path guard. Reset must not kill unknown processes, delete stable
lock inodes, or pretend a new manifest ID is a new on-chain deployment.

Lifecycle ownership is acquired before `anvil_reset`. A bootstrap that is deploying or waiting for a
seed receipt therefore blocks reset before any chain or environment mutation. Reset releases the
maintenance locks before lifecycle ownership; bootstrap uses the same outer-to-inner order.

`MOTORCOVE_ENV=<id> pnpm demo:reset -- --yes` applies these guards. Use it only for a disposable
owned environment. Automated CLI cases prove that `--yes` still refuses a non-loopback RPC URL,
chain ID other than 31337, and a client that does not identify as Anvil. Reset coverage also preserves
lock inodes and backups, and a real `flock` case proves bootstrap ownership prevents `anvil_reset`
until the owner exits. These checks do not prove resistance to a malicious process impersonating Anvil
on loopback.
