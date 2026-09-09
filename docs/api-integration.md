# 本机内容 API 与 CLI

本文件拥有外部内容调用、名称定位、提交及错误处理。界面入口见[设置操作](settings.md#本机-api)，认证与持久化机制见[服务运行](service-runtime.md)。

## 使用范围

当前支持 Codex 任务在取得对话授权后调用本机服务，直接提交一次内容操作，不增加软件内审批。覆盖 Workspace 笔记与目录、Journal 日记、Todo 集合与任务、仓库管理和 CTN 语法。系统设置、凭据与迁移继续由设置界面管理。内置 Agent 保留自己的提案审批与 exact CAS。

服务同时校验 socket、Host 和 Origin；只有确认的本机连接可以调用本机内容操作。每次调用显式提供服务地址，不使用默认服务器、默认仓库或 CLI 凭据。所有显式 Authorization 请求均被拒绝，包括以前有效的自动化和可信客户端 Bearer；不会降级为免密钥访问。旧令牌文件保留但不再读取，历史审计仍可查看。暂不扩展远程 API 令牌。

API 仍为 v4，内容仍为 Workspace v4、Journal v3、Todo v4。操作的精确方法、路径、请求和响应结构由 [registry](../contracts/api/registry.ts) 及运行服务的 OpenAPI 唯一提供；本文不维护第二份完整端点清单。

## 名称和相对路径

Workspace 每次显式给出仓库名称。在该仓库中，笔记标题唯一时可直接使用标题；同名时使用目录中的逻辑相对路径，例如 `操作系统/进程`。根目录笔记与子目录笔记同名时，使用 `./进程` 明确指定根目录。路径末段为笔记标题，不包含磁盘根目录或 `.ctn` 扩展名。

定位遵守现有名称归一化规则。只有唯一匹配才成功，找不到或存在歧义会返回明确错误；歧义包含候选相对路径。搜索可用关键词，写入不使用模糊匹配，不取第一个候选。业务标题、磁盘文件名和稳定 ID 均不重写，也不建立短编号或别名表。

目录和局部读取都返回存储 `baseRevision`。服务在同一权威快照上检查该版本并解析目标，旧请求不会因重命名、移动、删除或名称复用而转向另一对象。块操作使用局部读取结果中的块 ID；无需再次携带仓库和笔记的长 ID。

## CLI 读取

先在开发目录或独立运行目录执行各自的 `./start.sh`，再使用该目录的 `./ctn`。两个启动入口不接受模式参数。以下地址是示例，应以当前设置显示的服务地址为准：

```sh
./ctn --server http://127.0.0.1:3001 catalog
./ctn --server http://127.0.0.1:3001 directory workspace --repository '学习资料'
./ctn --server http://127.0.0.1:3001 search workspace --repository '学习资料' --text '进程' --limit 20
./ctn --server http://127.0.0.1:3001 read workspace --repository '学习资料' --resource '操作系统/进程'
./ctn --server http://127.0.0.1:3001 syntax workspace --repository '学习资料'
./ctn --server http://127.0.0.1:3001 directory journal
./ctn --server http://127.0.0.1:3001 directory todo
./ctn --server http://127.0.0.1:3001 openapi
```

`read` 可附加 `--block <块ID>`；加 `--subtree` 同时读取该块的后代。返回的范围和块位置仍相对于完整资源正文，正文只包含所选部分。无活动语法时仍能读原文，不能按块定位。`syntax` 返回当前语法、语法文件和写作指南。

目录不包含正文。搜索返回名称、路径、片段和必要版本；正文按需读取。`query --file query.json` 可发送 registry 定义的查询结构。CLI 是薄 HTTP 客户端，名称解析和内容修改只在服务端进行，不读取 bootstrap 或直接修改内容文件。

地址只能是本机 HTTP/HTTPS origin，不能包含凭据、路径、查询或片段；拒绝重定向。旧 `auth`、`request`、`sync checkout` 和 `sync commit` 入口已退出，不读取旧 CLI profile。

## 单次修改

操作文件包含自行分配且不复用的 `operationId`、从查询取得的 `baseRevision`、明确 scope 和一个领域命令。下面只演示形状；请将版本替换为实际读取结果：

```json
{
  "operationId": "process-note-edit-20260909-1",
  "baseRevision": "从读取响应原样复制",
  "scope": { "domain": "workspace", "repository": "学习资料" },
  "command": {
    "kind": "edit-content",
    "resource": "操作系统/进程",
    "edit": {
      "kind": "replace-text",
      "blockId": null,
      "replacements": [{ "oldText": "原句", "newText": "修改后的句子" }]
    }
  }
}
```

```sh
./ctn --server http://127.0.0.1:3001 apply --file operation.json
./ctn --server http://127.0.0.1:3001 result process-note-edit-20260909-1
```

`replace-text` 将全部片段在原文上定位后原子修改。旧文本在所选资源或块内必须唯一出现；零匹配、多匹配或片段重叠都拒绝整次请求。`set-block-text` 只修改块自身文字，`delete-subtree` 删除整个子树，`insert-blocks` 和 `move-block` 显式指定位置。Workspace 支持跨笔记移动；Journal 和 Todo 的块移动各自限制在一条记录或一个集合内。服务端生成新身份，保留未修改内容的身份和时间戳。

Todo 的完成与周期命令消费读取返回的任务状态，周期任务使用当前 occurrenceDate，普通任务使用 null。仓库管理使用 `scope.domain: "catalog"` 和 catalog 查询返回的目录版本；语法修改仍由相应领域验证。全部命令结构见 OpenAPI 和 [内容命令 schema](../contracts/content/commands.ts)。

一条请求只提交一个领域操作；同资源多个精确片段可以一起提交。不支持跨仓库、跨领域事务或强制覆盖。版本过期返回冲突，不自动合并、重新计算或重试。成功响应给出实际修改摘要、受影响身份、有限上下文差异和新版本，不附带整个领域快照。输入上限由 registry 定义，当前内容操作为 4 MiB。

## 操作收据与不确定结果

写入前先持久化操作意图。同 ID、同请求返回原结果；同 ID、不同请求拒绝。审计展示条数不会裁剪内容操作的去重收据。

| 状态 | 调用方行动 |
|---|---|
| `committed` | 内容已经提交；使用返回的新版本继续读取 |
| `conflict` | 旧版本未提交；重新读取并确认新的修改意图 |
| `failed` | 准备或校验已拒绝，保留错误原因 |
| `pending` | 正在执行；查询同一操作 ID |
| `indeterminate` | 无法证明结果；查询收据并核对受影响内容，禁止自动重放 |

内容已提交但审计收尾失败时，收据保持 `committed` 并单独标明 `audit: "failed"`。进程重启后，未完成的持久意图转为不确定状态，不自动执行。查不到操作 ID 也不能作为一次不确定请求“必定没写入”的证明。

CLI 不自动重放提交。网络断连或响应无法解码时保留原操作 ID 提示核对。错误响应使用严格的 `code`、`message`、`requestId`、`retryable` 和 `details`；即使错误被标记可重试，外部写入也必须先确认原操作结果。

| 退出码 | 含义 |
|---|---|
| 0 | 查询成功或内容已提交 |
| 1 | 客户端或未分类错误 |
| 2 | 命令行输入错误 |
| 3 | 来源或权限拒绝 |
| 4 | 请求校验、版本冲突或已拒绝操作 |
| 5 | 服务报告的可重试故障 |
| 6 | 正在执行、结果不确定，或已提交但审计失败；先查询核对 |
