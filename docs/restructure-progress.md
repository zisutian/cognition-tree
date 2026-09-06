# 全项目结构重整实施记录

本次实施基线为 `c76d7fe`，真实仓库为 `/home/zisu/code/cognition-tree/repo`，日期为 2026-09-06。实现收口于 `8410254`；随后只整理文档。本记录保存本轮核对与验证证据，不建立第二份运行时规则。当前职责和依赖的可执行权威仍是 [moduleRegistry.ts](../tests/architecture/moduleRegistry.ts)，长期架构与操作规则分别见 [架构边界](architecture.md) 和 [使用与部署](getting-started.md)。

## 已关闭的实施项

- [x] 公共 Contracts schema、诊断基础和 Todo 日期端口完成归属；消除反向依赖与隐式格式初始化。
- [x] Journal 同日序号选择、未解决单元证明、冲突期间编辑、权威 snapshot 与自动续传完成回归。
- [x] local-first 保存及目录协调迁入 Application；HTTP、缓存与浏览器组合根分开，删除旧包装和无调用 codec。
- [x] 浏览器、CLI、服务端使用 API v4 registry；v3 路由已删除，Workspace v4、Journal v3、Todo v4 保持不变。
- [x] 迁移状态机、持久记录、目录所有权、写入租约、提交对账、启动恢复与界面完成。
- [x] Agent、搜索、系统用例归 Application；普通三方同步和已批准 Agent exact CAS 保持不同提交语义。
- [x] 主机正规化和 IP 分类由 server/network 统一拥有；配置、探测和请求共用策略。
- [x] 活动注册表归界面组合根；共享控件和各 Activity 使用窄接口，调度从端口注入。
- [x] 818 个生产文件、74 个模块全部归属；类型导入、重导出、动态导入、资源、根配置及启动脚本纳入检查；文件图与模块图均无环，无临时豁免。
- [x] 产品、架构、界面和部署恢复说明已按最终实现修订；全量测试、构建、包体积、真实进程和 Chromium 验证结果见下文。

## 原审查的五项缺陷

| 缺陷 | 修复及可复查证据 |
|---|---|
| Journal 选择 remote 却保留 local | 选择一侧决定碰撞条目身份，保留非冲突内容及序号上界；[真实 Journal 文件 store 回归](../tests/infrastructure/server/repository/journalSequenceMerge.test.ts) 覆盖两个方向，重读磁盘；[领域合并](../tests/application/journal/persistence/journalThreeWayMerge.test.ts) 覆盖集合语义。 |
| 指针已替换后错误仍被当作未提交 | 提交结果独立建模，未知结果锁内对账；[恢复回归](../tests/infrastructure/server/system/dataRootMigrationRecovery.test.ts) 覆盖替换后报错、再次对账和重启失败；[进程中断](../tests/infrastructure/server/system/dataRootMigrationProcess.test.ts) 在替换点终止并重启。 |
| 失败删除外部占用的目标 | 目标排他分配，失败保留分配结果；[协调器回归](../tests/infrastructure/server/system/dataRootMigrationCoordinator.test.ts) 在预检后创建外来目录与标记并确认保留。 |
| 编辑消除冲突后队列仍阻止同步 | 接受后的 snapshot 为唯一权威；[完整保存链](../tests/infrastructure/client/repository/conflictEditingIntegration.test.ts)、[三领域部分/全部消除](../tests/infrastructure/client/repository/domainConflictEditing.test.ts) 与真实编辑器浏览器回归覆盖。 |
| IPv6 被错误当成域名 | [Provider 地址策略](../tests/infrastructure/server/agent/providerTargetPolicy.test.ts) 使用真实 URL 和可控 DNS，覆盖方括号、压缩/展开、mapped、私有/禁止/混合结果。 |

真实编辑器验证还暴露了隐藏修改时间制造伪冲突的问题：正文改回后 metadata 时间仍变化。现由 CTN 解析位置区分内容与修改时间，只合并同一块身份/创建时间的最新修改时间；身份、创建时间和正文变化仍参与冲突判断。[metadata 回归](../tests/core/ctn/metadata/sourceMergeMetadata.test.ts) 和三领域/浏览器回归均已覆盖。

Agent 的内容提交与审计收尾也已分开记录；已知内容提交后发生审计失败，不再重新执行修改。Agent CAS 到审计收尾、凭据安装到配置提交、后台符合性记录以及请求派生任务共享写入准入，并为已开始的子任务保留独立租约。

## 验证索引

模块表中的编号指以下验证类别；每个模块同时经过唯一归属、公开入口、文件图与模块图检查。类别中的测试验证实际调用链，不能理解为对每一行代码的形式化证明。

| 编号 | 场景和代表入口 |
|---|---|
| D | 领域命令、CTN、身份、日期、合并：[Core](../tests/core)、[Workspace](../tests/application/workspace)、[Journal](../tests/application/journal)、[Todo](../tests/application/todo)。 |
| S | stage/sync 交错、旧响应拒绝、冲突编辑和自动续传：[保存队列](../tests/application/persistence/versionedRepositorySaveQueue.test.ts)、[三领域冲突编辑](../tests/infrastructure/client/repository/domainConflictEditing.test.ts)。 |
| P | 加载、离线缓存、catalog 竞态与真实持久化：[客户端组合](../tests/infrastructure/client/runtime)、[内容准入](../tests/infrastructure/client/http/workspaceContentAdmission.test.ts)、[持久化集成](../tests/integration/workspacePersistence.test.ts)。 |
| A | Agent scope、审批、exact CAS、幂等、审计失败、Provider 协调与测试模型：[应用 Agent](../tests/application/agent)、[服务及适配](../tests/infrastructure/server/agent)、[浏览器 Agent](../e2e/workbench-agent.pw.ts)。 |
| C | API v4 registry、路由构造、权限声明、schema 初始化和 CLI：[契约](../tests/contracts)、[CLI](../tests/tooling/cli/ctnCli.test.ts)。 |
| H | 真实 HTTP、鉴权、错误、SSE 和恢复协议：[HTTP 集成](../tests/infrastructure/server/api)、[恢复 HTTP](../tests/infrastructure/server/system/migrationRecoveryHttp.test.ts)、[浏览器传输](../tests/infrastructure/client/http)。 |
| L | CAS/WAL、安全 JSON、锁、账本和真实磁盘：[文件存储](../tests/infrastructure/server/repository)、[安全分区](../tests/infrastructure/server/state/secureJsonPartition.test.ts)、[账本](../tests/infrastructure/server/agent/operationLedger.test.ts)。 |
| M | 迁移占用/复制/校验/未知提交、重复对账、进程重启、写入排空：[迁移](../tests/infrastructure/server/system)、[写入上下文](../tests/infrastructure/server/platform/dataRootWriteScope.test.ts)、[真实迁移 UI](../e2e/workbench-migration.pw.ts)。 |
| N | IPv4/IPv6、DNS 混合结果、超时、重定向及有界 JSON/SSE：[Provider 策略](../tests/infrastructure/server/agent/providerTargetPolicy.test.ts)、[模型协议](../tests/infrastructure/server/agent/openAiChatProtocol.test.ts)。 |
| Q | 搜索索引、增量缓存、定位和跨视图导航：[搜索](../tests/application/search)、[浏览器搜索](../e2e/workbench-search.pw.ts)。 |
| E | 编辑器输入法、撤销重做、选区和保存前 flush：[编辑器](../tests/presentation/editor)、[真实编辑器](../e2e/workbench-editor.pw.ts)。 |
| U | React 投影、控件、活动切换和用户流程：[界面测试](../tests/presentation)、[Chromium](../e2e)。 |
| B | 类型、构建、包体积、模块检查、容量、开发及编译入口；提交继续经过既有钩子。 |

## 模块职责核对

下表是 `8410254` 的静态快照：774 个 TS/JS 源文件，另有样式、配置和启动资源，共 818 个生产文件；AST 与 CSS 导入共取得 2,999 条相对依赖记录。实际调用方列为本次文件图反向索引，包含类型引用和重导出；不把允许依赖误写成已发生调用。`index.ts` 表示本模块下的公开入口；“可执行/声明根”不对其他模块提供库入口。所有模块均已核对。

### Application

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `application/agent`（15） | 通用会话、scope、提案审批模型与浏览器 Agent controller；客户端已接受 session/status 为权威 | `index.ts` | `application/agentHost`、`application/operations`、`infrastructure/client/http`、`infrastructure/client/platform`、`infrastructure/client/runtime`、`infrastructure/server/agent`、`infrastructure/server/api/http`、`presentation/activities/agent`、`presentation/activities/settings`、`presentation/shell`；A |
| `application/agentHost`（35） | 服务端驻留会话、turn 队列、暂存、exact CAS、Provider 操作；session pool、proposal workflow 各自持有生命周期状态 | `index.ts` | `infrastructure/server`、`infrastructure/server/agent`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；A、M |
| `application/apiAccess`（2） | owner/automation 管理端口及客户端管理投影 | `index.ts` | `infrastructure/client/http`、`infrastructure/client/runtime`、`presentation/activities/settings`、`presentation/shell`；H |
| `application/commands`（5） | 命令准备、来源证明和已批准命令契约；不持有平台状态 | `index.ts` | `application/agent`、`application/agentHost`、`application/journal`、`application/sync`、`application/todo`、`application/workspace`、`infrastructure/server/api/http`、`infrastructure/server/api/sync`、`infrastructure/server/runtime`；D、A |
| `application/journal`（13） | Journal session、内容准备、合并与冲突策略；接受后的 repository snapshot 为权威 | `index.ts` | `application/agentHost`、`application/workbench`、`infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`presentation/activities/journal`、`presentation/activities/syntax`、`presentation/shell`；D、S |
| `application/navigation`（2） | 跨视图导航请求及位置契约；不创建领域内容 | `index.ts` | `application/journal`、`application/workbench`、`presentation/activities/search`；U |
| `application/operations`（4） | 账本命令、receipt 与错误端口；持久权威由注入的账本实现提供 | `index.ts` | `application/agentHost`、`infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server/api/http`、`infrastructure/server/operations`、`presentation/activities/settings`、`presentation/shell`；A、L |
| `application/persistence`（18） | 接受后的 snapshot、local-first 协调、保存调度、transition 顺序；队列不再维护独立冲突 | `index.ts` | `application/agent`、`application/agentHost`、`application/commands`、`application/journal`、`application/repository`、`application/sync`、`application/todo`、`application/workbench`、`application/workspace`、`infrastructure/client/http`、`infrastructure/client/repository`、`infrastructure/client/runtime`、`infrastructure/server/agent`、`infrastructure/server/api/http`、`infrastructure/server/api/sync`、`infrastructure/server/operations`、`infrastructure/server/repository`、`infrastructure/server/state`、`presentation/shell`；S、P |
| `application/problems`（3） | 应用问题投影和订阅；不重新解释内容 | `index.ts` | `application/agent`、`application/syntax`、`application/workbench`、`application/workspace`、`infrastructure/client/runtime`、`presentation/shell`、`presentation/ui`；U |
| `application/repository`（18） | 目录选择、生命周期与内置目录离线策略；远端结果为权威，缓存仅回退 | `index.ts` | `application/journal`、`application/todo`、`application/workbench`、`application/workspace`、`infrastructure/client/http`、`infrastructure/client/platform`、`infrastructure/client/repository`、`infrastructure/client/runtime`、`presentation/activities/journal`、`presentation/activities/notes`、`presentation/activities/repository`、`presentation/activities/search`、`presentation/activities/todo`、`presentation/activities/unavailable`、`presentation/shell`、`presentation/ui`；P、U |
| `application/runtime`（3） | 时钟、调度和写入准入端口；写入屏障唯一持有 admission/active lease 状态 | `index.ts` | `application/agent`、`application/agentHost`、`application/journal`、`application/persistence`、`application/problems`、`application/todo`、`application/workbench`、`application/workspace`、`infrastructure/client/platform`、`infrastructure/server/api/http`、`infrastructure/server/platform`、`infrastructure/server/runtime`、`presentation/shell`、`presentation/workspace`；M |
| `application/search`（8） | 搜索来源协调、revision 缓存、查询、排序与导航；不持有 HTTP 或存储实现 | `index.ts` | `application/agentHost`、`application/workbench`、`infrastructure/server/api`、`infrastructure/server/runtime`、`presentation/activities/search`、`presentation/shell`、`tooling/benchmark`；Q |
| `application/sync`（4） | 普通同步用例、revision 观察和发布顺序；不改变 Agent exact CAS | `index.ts` | `application/workbench`、`infrastructure/client/http`、`infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/api/sync`、`infrastructure/server/runtime`；H、S |
| `application/syntax`（6） | 语法配置 draft/session 和 UI-neutral 诊断位置；不反向依赖 Workspace 定位类型 | `index.ts` | `application/workbench`、`application/workspace`、`presentation/activities/syntax`、`presentation/shell`、`presentation/syntax`、`presentation/workspace`；D、U |
| `application/system`（7） | 系统设置与持久迁移状态机；阶段、提交结果和权威目录证明由 coordinator 管理 | `index.ts` | `infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/system`、`presentation/activities/settings`、`presentation/shell`；M、H |
| `application/todo`（15） | Todo session、合并、周期策略及本地日期端口；接受后的 snapshot 为权威 | `index.ts` | `application/agentHost`、`application/workbench`、`infrastructure/client/http`、`infrastructure/client/platform`、`infrastructure/client/runtime`、`infrastructure/server/agent`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`presentation/activities/syntax`、`presentation/activities/todo`、`presentation/shell`；D、S |
| `application/workbench`（13） | 跨领域工作台、会话选择、导航、搜索与保存前 flush 的显式组合 | `index.ts` | `infrastructure/client/runtime`、`infrastructure/server/api`、`presentation/activities/search`、`presentation/activities/syntax`、`presentation/shell`、`presentation/ui`；U、S |
| `application/workspace`（40） | Workspace session、领域命令、准备、冲突和目录协调；内容 snapshot 与目录投影顺序分别拥有 | `index.ts` | `application/agentHost`、`application/workbench`、`infrastructure/client/http`、`infrastructure/client/repository`、`infrastructure/client/runtime`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`presentation/activities/notes`、`presentation/shell`、`presentation/workspace`、`tooling/benchmark`；D、S、P |

### Contracts

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `contracts/agent`（7） | Agent wire schema、模型工具结构和解码；仅消费公共 schema 基础 | `index.ts` | `contracts/api`、`infrastructure/client/http`、`infrastructure/server/agent`、`infrastructure/server/api/http`、`infrastructure/server/operations`；C、A |
| `contracts/api`（23） | API v4 操作、路径、方法、权限与解析 registry；HTTP catalog 只聚合 | `index.ts` | `infrastructure/client/http`、`infrastructure/server/access`、`infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/protocol`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/operations`、`infrastructure/server/system`、`tooling/cli`；C、H |
| `contracts/built-ins`（3） | 内置内容目录的传输结构与解码 | `index.ts` | `contracts/api`、`infrastructure/client/http`、`infrastructure/client/repository`、`infrastructure/client/runtime`、`infrastructure/server/repository`；C、P |
| `contracts/common`（8） | 通用 schema、格式和有界校验；格式在解码边界显式初始化 | `index.ts` | `contracts/agent`、`contracts/api`、`contracts/built-ins`、`contracts/journal`、`contracts/todo`、`contracts/workspace`、`infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server/agent`、`infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/persistence`、`infrastructure/server/repository`、`infrastructure/server/runtime`、`infrastructure/server/state`、`infrastructure/server/system`；C |
| `contracts/journal`（5） | Journal 内容 v3 传输结构及解码；不随 API 升级 | `index.ts` | `contracts/api`、`infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server/api/sync`、`infrastructure/server/repository`；C、D |
| `contracts/todo`（5） | Todo 内容 v4 传输结构及解码 | `index.ts` | `contracts/agent`、`contracts/api`、`infrastructure/client/http`、`infrastructure/client/runtime`、`infrastructure/server/api/sync`、`infrastructure/server/repository`；C、D |
| `contracts/workspace`（8） | Workspace 内容 v4 传输结构及解码 | `index.ts` | `contracts/api`、`infrastructure/client/http`、`infrastructure/client/repository`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`tooling/benchmark`；C、D |

### Core

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `core/ctn`（30） | CTN 编译、解析、诊断与文档运算；解析索引拥有 metadata 位置和修改时间合并语义 | `index.ts` | `application/agent`、`application/agentHost`、`application/commands`、`application/journal`、`application/search`、`application/syntax`、`application/todo`、`application/workbench`、`application/workspace`、`core/journal`、`core/sync`、`core/todo`、`core/workspace`、`infrastructure/server/api`、`infrastructure/server/api/resources`、`infrastructure/server/repository`、`presentation/activities/notes`、`presentation/editor`、`presentation/syntax`、`presentation/ui`、`presentation/workspace`、`tooling/benchmark`；D、E |
| `core/errors`（2） | 不含领域依赖的诊断基础；定位由各领域定义 | `index.ts` | `application/journal`、`application/todo`、`application/workspace`、`core/journal`、`core/todo`、`core/workspace`、`infrastructure/server/api/http`；D |
| `core/journal`（12） | Journal 身份、日期、序号、标题和内容约束；无平台状态 | `index.ts` | `application/agentHost`、`application/journal`、`application/workbench`、`infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`presentation/shell`；D、S |
| `core/naming`（2） | 共享名称约束与正规化；无平台状态 | `index.ts` | `application/repository`、`application/todo`、`application/workbench`、`core/journal`、`core/todo`、`core/workspace`、`infrastructure/client/http`、`infrastructure/client/repository`、`infrastructure/server/api/http`、`infrastructure/server/repository`；D |
| `core/sync`（3） | 纯三方合并与未处理冲突单元；偏好不构成成功证明 | `index.ts` | `application/agent`、`application/agentHost`、`application/commands`、`application/journal`、`application/todo`、`application/workspace`；D、S |
| `core/todo`（20） | 任务、完成记录、周期及内容约束；无平台状态 | `index.ts` | `application/agentHost`、`application/todo`、`application/workbench`、`infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/resources`、`infrastructure/server/api/sync`、`infrastructure/server/repository`、`presentation/activities/todo`、`presentation/shell`；D、S |
| `core/workspace`（21） | 树、笔记身份与内容约束；无外层依赖 | `index.ts` | `application/agent`、`application/workbench`、`application/workspace`、`infrastructure/server/api`、`infrastructure/server/api/resources`、`infrastructure/server/repository`、`presentation/activities/notes`、`presentation/workspace`、`tooling/benchmark`；D、S |

### 浏览器适配与组合

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `infrastructure/client/http`（17） | HTTP/SSE、wire 编解码、错误与缓存身份适配；不构造缓存或 local-first 用例 | `index.ts` | `infrastructure/client/runtime`、`presentation/shell`、`tooling/benchmark`；H、P |
| `infrastructure/client/platform`（4） | 浏览器时钟、UUID、调度、日期和 localStorage 偏好适配；不创建初始内容 | `index.ts` | `infrastructure/client/runtime`、`presentation/shell`；U、S |
| `infrastructure/client/repository`（8） | 页面内存目录、snapshot 缓存和缓存编码；不拥有远端协调策略 | `index.ts` | `infrastructure/client/runtime`、`tooling/benchmark`；P |
| `infrastructure/client/runtime`（11） | 浏览器组合根：接线 HTTP、缓存、领域 preparation、调度与用例 | `index.ts` | `presentation/shell`；P、U |

### 服务端适配与组合

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `infrastructure/server/access`（4） | automation/trusted-client token 的持久存储与使用记录；owner 凭据归 bootstrap | `index.ts` | `infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；H、M |
| `infrastructure/server/agent`（32） | 模型网络协议、IPC、子进程、Provider 配置与凭据适配；不持有应用会话权威 | `index.ts` | `infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；A、N、M |
| `infrastructure/server/api/http`（17） | HTTP 生命周期、认证、分派、限额、错误和中立事件到 SSE 的适配 | `index.ts` | `infrastructure/server`、`infrastructure/server/runtime`；H、M |
| `infrastructure/server/api/protocol`（2） | HTTP 错误协议基础；供普通与恢复服务共用 | `index.ts` | `infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/sync`、`infrastructure/server/system`；H |
| `infrastructure/server/api/resources`（6） | 已准备内容到 wire 资源的只读投影 | `index.ts` | `infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；H、Q |
| `infrastructure/server/api`（3） | 搜索 HTTP 输入和结果适配；查询用例归 Application | `index.ts` | `infrastructure/server/api/http`、`infrastructure/server/runtime`；Q、H |
| `infrastructure/server/api/sync`（3） | 普通同步 wire 适配和同步事件传输；用例与 revision 顺序归 Application | `index.ts` | `infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；H、S |
| `infrastructure/server/client`（2） | 编译后静态页面与资源服务；不创建应用状态 | `index.ts` | `infrastructure/server`；B |
| `infrastructure/server`（2） | 可执行服务端组合根；先处理未结束迁移，再创建服务，拥有启动/关闭次序 | 可执行/声明根 | 可执行入口、工具或环境声明；M、B |
| `infrastructure/server/network`（5） | URL 主机规范化、IP 分类、DNS 和入站传输边界；各调用点消费同一分类 | `index.ts` | `infrastructure/server/agent`、`infrastructure/server/api/http`、`infrastructure/server/system`；N、H |
| `infrastructure/server/operations`（7） | 持久 receipt、幂等记录和账本分区；已提交内容与收尾失败分别记录 | `index.ts` | `infrastructure/server`、`infrastructure/server/api/http`、`infrastructure/server/runtime`；A、L、M |
| `infrastructure/server/persistence`（3） | 文件、目录 fsync、原子替换和跨进程锁；不解释领域冲突 | `index.ts` | `infrastructure/server/repository`、`infrastructure/server/state`、`infrastructure/server/system`；L、M |
| `infrastructure/server/platform`（3） | Node 调度与异步写入上下文；每个派生写任务独立持有 lease | `index.ts` | `infrastructure/server/runtime`；M |
| `infrastructure/server/repository`（34） | 真实文件内容、CAS、WAL、catalog 与内置目录；锁内检查 before/after 并返回真实写入内容 | `index.ts` | `infrastructure/server`、`infrastructure/server/api`、`infrastructure/server/api/http`、`infrastructure/server/api/sync`、`infrastructure/server/runtime`、`tooling/benchmark`；D、L、M |
| `infrastructure/server/runtime`（8） | 服务端显式组合根：Agent 三领域工具、搜索来源、Provider 和共享写入范围 | `index.ts` | `infrastructure/server`；A、M、H |
| `infrastructure/server/state`（4） | 安全 JSON 分区、锁内事务与未知提交对账；不将具体 I/O 失败等同未提交 | `index.ts` | `infrastructure/server/access`、`infrastructure/server/agent`、`infrastructure/server/operations`、`infrastructure/server/system`；L、M |
| `infrastructure/server/system`（10） | 固定 bootstrap、迁移记录、目录所有权、文件复制/校验和本机恢复 HTTP 适配 | `index.ts` | `infrastructure/server`；M、H |
| `infrastructure/server/transport`（2） | SSE socket、backpressure 和慢连接隔离；不决定应用事件顺序 | `index.ts` | `infrastructure/server/api/http`、`infrastructure/server/api/sync`；A、H |

### Presentation

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `presentation/activities/agent`（10） | Agent 对话、scope、diff 和审批视图；应用 session 为权威 | `index.ts` | `presentation/shell`；A、U |
| `presentation/activities/journal`（5） | Journal Activity 及 React 绑定；内容与冲突来自领域 session | `index.ts` | `presentation/shell`；U、S |
| `presentation/activities/notes`（39） | 笔记、图谱和结构视图；只持有展示交互状态 | `index.ts` | `presentation/shell`；U、S |
| `presentation/activities/repository`（15） | 仓库管理视图；不直连存储 | `index.ts` | `presentation/shell`；U、P |
| `presentation/activities/search`（8） | 搜索输入、结果与导航视图；不解析 CTN | `index.ts` | `presentation/shell`；Q、U |
| `presentation/activities/settings`（30） | 系统、迁移、Agent、访问和审计设置；刷新重取持久迁移状态 | `index.ts` | `presentation/shell`；M、A、H、U |
| `presentation/activities/syntax`（14） | 语法 Activity；消费独立语法和领域接口 | `index.ts` | `presentation/shell`；D、U |
| `presentation/activities/todo`（8） | Todo Activity 及 React 绑定；日期策略从领域端口取得 | `index.ts` | `presentation/shell`；D、S、U |
| `presentation/activities/unavailable`（4） | 不可用内容占位投影；不拥有加载与重试策略 | `index.ts` | `presentation/activities/journal`、`presentation/activities/notes`、`presentation/activities/todo`；U |
| `presentation/editor`（17） | CodeMirror、输入法、选择区、撤销重做和 flush 绑定；编辑器交互状态 | `index.ts` | `presentation/activities/journal`、`presentation/activities/notes`、`presentation/activities/todo`；E、U |
| `presentation/shell`（21） | React 组合根、Activity registry、窄接口接线和导航外壳；ActivityBar 仅接描述数据 | `index.ts` | 可执行入口、工具或环境声明；U、B |
| `presentation/syntax`（2） | 可共享的语法 draft React 绑定；无具体 Activity 依赖 | `index.ts` | `presentation/activities/syntax`、`presentation/workspace`；D、U |
| `presentation/ui`（65） | 共享控件、工具面板、导航描述与样式；hook 由注入取得调度器 | `index.ts`、`styles/index.css` | `presentation/activities/agent`、`presentation/activities/journal`、`presentation/activities/notes`、`presentation/activities/repository`、`presentation/activities/search`、`presentation/activities/settings`、`presentation/activities/syntax`、`presentation/activities/todo`、`presentation/activities/unavailable`、`presentation/editor`、`presentation/shell`；U |
| `presentation`（1） | 浏览器环境类型声明；无运行状态或可导入库入口 | 可执行/声明根 | 可执行入口、工具或环境声明；B |
| `presentation/workspace`（8） | Workspace 展示状态和可复用编辑投影；不拥有 repository 保存事实 | `index.ts` | `presentation/activities/notes`、`presentation/activities/syntax`、`presentation/activities/unavailable`、`presentation/shell`；U、E |

### 工程工具

| 模块（文件数） | 职责与状态所有者 | 公开入口 | 当前调用方；验证 |
|---|---|---|---|
| `tooling/benchmark`（1） | 同配置容量基准可执行入口；仅使用临时数据 | 可执行/声明根 | 可执行入口、工具或环境声明；B |
| `tooling/build`（2） | 构建清理与包体积、懒加载校验入口；只处理可重建产物 | 可执行/声明根 | 可执行入口、工具或环境声明；B |
| `tooling/cli`（7） | trusted-client CLI 与本地凭据适配；只通过公开 API registry 访问服务 | `index.ts` | 可执行入口、工具或环境声明；C、H |
| `tooling/config`（11） | 编译、测试、依赖及包配置；无领域状态 | 可执行/声明根 | 可执行入口、工具或环境声明；B |
| `tooling/git`（3） | 提交钩子和提交消息校验；原有规则继续执行 | 可执行/声明根 | 可执行入口、工具或环境声明；B |

## 最终验证

| 检查 | 实施后结果 |
|---|---|
| 类型检查 | 浏览器、Node、CLI、server、E2E、benchmark 六套配置通过。 |
| 全量单元与集成 | 252 个测试文件，1,271 项通过；含真实文件系统、故障注入、子进程迁移恢复。 |
| 架构/设计 | 47 项通过；真实文件系统与扫描输入一致，唯一归属、公开入口和两个依赖图均通过。 |
| 前端、服务端构建 | 通过；8 个 Activity 懒加载入口被识别。 |
| 包体积 | 初始 JS 合计 734,603 bytes；最大初始块约 389.28 kB，原有每块 500,000 bytes 门槛保持。 |
| Chromium E2E | 41 项通过；覆盖编辑、冲突继续编辑及自动恢复、导航、Agent 和真实临时目录迁移。 |
| 开发及编译后服务端入口 | 临时完整源码副本/构建资源、真实子进程及 Chromium 页面挂载通过；API v4 可用、v3 为 404、SIGTERM 后正常退出。 |
| 容量 | 同为 1,000 篇笔记、100,000 个块；详细对照见下表。 |

迁移中断测试在准备、分配后、校验、提交前、指针已替换和等待重启六个位置使用 SIGKILL，再启动独立进程确认目录和写入状态。指针替换中断保留生产 writer lock：锁未过期时禁止写入，正常过期后才重新证明权威。已完成迁移后继续编辑并再次启动，不再被旧摘要阻止。

开发入口验证使用完整临时副本，避免把跨目录符号链接产生的开发工具监听器现象混同为标准 checkout 的退出结果。所有新业务数据、故障目标和测试凭据都位于测试临时目录；没有迁移或改写用户的实际业务数据。

## 容量前后对照

基线与实施后的参数均为 `pnpm benchmark:capacity`（脚本固定 `noteCount = 1000`、`blocksPerNote = 100`）。快照同为 13,499,678 bytes、目录投影 1,100 行、outline 99 行；CTN 分析 1,000 次、语义准备 2 次、语法编译 1 次、wire 解码 1 次均相同。热索引额外分析为 0，修改 registry owner 为 1，搜索投影为 1。前后提交内容 revision 一致。

下列数据是同配置单次观测，不据此宣称统计意义上的加速；HTTP commit 和内存操作有小幅变化，门槛未放宽。

| 指标 | 基线 | 实施后 |
|---|---:|---:|
| 冷启动内容分析（ms） | 675.23 | 616.48 |
| 单笔记热编辑分析（ms） | 21.49 | 19.98 |
| 热索引提交（ms） | 21.37 | 18.44 |
| 冷语义准备（ms） | 712.97 | 570.13 |
| 内存 stage（ms） | 15.36 | 17.99 |
| HTTP load（ms） | 95.49 | 90.31 |
| HTTP commit（ms） | 247.51 | 240.54 |
| 文件 commit（ms） | 4501.08 | 3999.99 |
| 文件 load（ms） | 1852.80 | 1719.34 |
| heap used（bytes） | 1,094,914,072 | 1,081,746,864 |
| RSS（bytes） | 1,272,180,736 | 1,294,770,176 |

## 验证边界

- 进程终止和重启是进程恢复证据；本轮未实施真实断电或存储硬件故障测试。
- Provider 协议与 Agent 使用可控模型和登录子进程；未连接真实模型服务或使用真实用户凭据登录。
- 浏览器验证为本机 Linux Chromium；其他浏览器、操作系统及真实远程部署未在本轮验证。
- 全量检查与职责核对通过，表示上述边界和场景得到验证，不代表所有可能输入均无缺陷。
