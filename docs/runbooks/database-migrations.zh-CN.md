# 如何迁移自有数据库

[English](database-migrations.md) · [繁體中文](database-migrations.zh-TW.md)

使用此 Runbook 在一次性或明确选择的本地环境中进行架构更改。

## 先决条件

- API 和 Indexer 已针对目标环境停止。
- `.motorcove/environments/` 下的安全环境蛞蝓。
- 审查了 Drizzle 架构并生成了 SQL。切勿将此流程指向预先存在的 `data/` DB。

## 生成并检查存储库工件

```bash
pnpm db:generate --name add_descriptive_name
pnpm db:check
```

查看 SQL、Drizzle 元数据、有序哈希、聚合摘要、规范化模式指纹、模式源摘要和投影器兼容性。 `db:check` 将排序后的 `packages/database/src/schema/*.ts` 内容绑定到 `schema-contract.json`，因此在没有重新生成和审核的迁移合约的情况下进行模式编辑会导致存储库门失败。请勿使用 `drizzle-kit push` 或编辑已应用的迁移。

## 检查和迁移

```bash
pnpm db:status --env docs-smoke
pnpm db:plan --env docs-smoke
pnpm db:migrate --env docs-smoke
pnpm db:verify --env docs-smoke
```

状态和计划是只读的，不会创建丢失的环境。 Migrate 采用独占服务和写入器锁，写入持久标记，应用官方 SQLite 迁移器，验证历史记录/架构/FK/完整性，写入 `db_contract`，然后清除标记。

该标记将中断的迁移绑定到环境、数据库路径、模式契约和迁移包摘要。重新运行 `db:migrate` 仅继续该确切的捆绑包。在挂起的迁移运行之前会验证已知的旧前缀。如果 SQL 已达到当前模式，则恢复将在清除标记之前完成并重新验证 `db_contract`。

具有挂起迁移的现有数据库必须在应用任何 SQL 之前发布经过验证的迁移前备份。仅在快照发布并验证后，标记才会记录备份 ID。匹配的重新运行会重新打开该备份，并将其环境、部署、本机历史记录、源包摘要和架构指纹与实时源数据库进行比较。如果备份创建失败，则重新运行将重试备份创建；它不能将失败的标记视为快照存在的证据。如果 SQL 备份后失败，则重复使用相同的已验证快照。

所有权初始化仅限于真正空的环境目录。数据库、WAL 或 SHM 文件、部署/引导/种子/维护/节点 sidecar、符号链接或任何其他不带 `owner.json` 的现有文件将被保留并被拒绝为 `DB_NOT_OWNED`。采用或导入需要单独的明确工作流程； `db:migrate` 从不围绕现有状态创建所有权元数据。

## 验证

真正的 `0000` 到 `0001` 装置保留现有的链事件，同时添加源记录完整性存储。由于迁移的行无法追溯证明不存在的摘要，因此重建会拒绝它们，并且部署扫描开始的重新索引会在发布当前投影元数据之前重新获取经过验证的源。

## 故障排除

- `RESOURCE_BUSY`：停止API/Indexer或其他维护命令；不要杀死未知的进程。
- `DB_HISTORY_DIVERGED`：保留DB和标记。不要重写账本。
- `DB_SCHEMA_DRIFT`：与新迁移的临时数据库进行比较并添加向前迁移。
- `MAINTENANCE_INCOMPLETE`：使用 `pnpm ops:recover --env <id>` 检查，然后运行
  `--complete`。 `RERUN_MATCHING_MIGRATION` 表示使用相同的已检查源和迁移包重新运行 `pnpm db:migrate --env <id>`。当前模式恢复最终确定元数据。已更改的捆绑包、未知的历史记录或架构漂移仍然被阻止。没有捆绑标识的旧标记会报告 `USE_ORIGINAL_RELEASE_MIGRATION_TOOL` 的背后模式。不要删除标记。
- `MIGRATION_BACKUP_INVALID`：保留标记并备份。记录的快照不再
  匹配迁移所需的源身份；请勿更换证明或绕过检查。
- `DB_NOT_OWNED: existing environment state`：环境包含状态但没有所有者记录。
  不要手动添加 `owner.json` 或针对该目录重新运行。

所检查的`data/motorcove.sqlite`没有被修改，不会被自动采用。
