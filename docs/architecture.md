# 架构边界

本文件只定义源码所有权、依赖方向、数据流、持久化与运行时边界。用户可见承诺见
[产品需求](product-requirements.md)，CTN 内部分析见
[CTN 分析流水线](ctn-analysis-pipeline.md)，精确排布与视觉见
[界面规范](ui-guidelines.md)，运行和升级步骤见[使用与部署](getting-started.md)。


## 1. 领域

    Workspace：零个或多个普通笔记库。
    Journal：全局唯一的日记库。
    Todo：全局唯一的代办库。

三个内容领域互不直接依赖，也不继承统一文档库模型。它们只共享 CTN、可移植名称和值无关的 versioned persistence。Repository 不是内容领域，只管理普通 catalog、内置数据 descriptor、位置、故障和运维。


## 2. 源码层次

core/

    纯领域代码。core/ctn 提供解析、metadata reconcile、引用与 syntax schema/compiler；core/naming 提供名称值和唯一键；core/workspace、journal、todo 分别拥有自己的内容、命令、查询与 transition。

application/

    框架无关的用例、端口、session controller、read model 和问题投影。application/persistence 持有通用 VersionedRepository、保存队列和 VersionedSessionController；application/syntax 独占 UI-neutral 的 syntax draft projection，包括选项、约束、稳定 field ID、focus target 与诊断位置。跨内容领域协调只允许两个显式且互不导入的根：application/workbench 拥有工作台、跨仓导航、保存前 flush 和搜索组合；application/agent 拥有硬范围、runtime port、staging、proposal、审批状态机与 exact commit 用例。application/system 只拥有启动配置用例、端口和状态机，不感知内容领域。

infrastructure/

    client 侧内存 cache、HTTP/SSE 适配、Node server、本地 working-tree repository，
    以及 Agent profile、模型 adapter、Codex 子进程、私有 IPC、内存会话和
    operation ledger。CAS 与保存队列策略属于 application，平台层只实现端口；
    client 不直接导入任何 Server 实现。Node 是开发与生产的唯一 HTTP composition
    root；浏览器与 API 同源，客户端只使用相对 `/api/v3`，不存在独立启动配置或
    客户端 owner token。同端口、同进程只是运行与部署事实，不授予前端调用服务端
    内部模块的能力。

presentation/

    React bindings、AppRoot、Activity Controller/View、CodeMirror 与共享 UI。React hooks 只存在于这一层。Syntax 编辑视图只消费 application/syntax 的 draft projection 并映射 React 交互，不重新定义选项、约束、field ID、focus target 或诊断位置；core/ctn/syntax 仍只提供 syntax schema/compiler，不制造 React/view contract。非视图 draft persistence 或分析 adapter 可为实际领域行为依赖 core syntax 接口，但不得成为第二个展示投影 owner。

contracts/

    前后端中立的 wire 类型和运行时解析。contracts/api registry 是 HTTP
    路径、方法、body schema、operationId 与 scope 的唯一 owner；领域
    contract 仍按 common、agent、workspace、journal、todo、built-ins 分开。
    contracts/agent 独占 Agent tool、scope、session、proposal、event 与 IPC wire
    schema，但不承载 mutation；API operation catalog 按 foundation、content、
    auth、sync、agent、admin 分区，不存在第二个单体 schema catalog。

tooling 不属于运行时源码层，只持有工程脚本和专用配置。tests 与 e2e 验证边界，
但生产层不得反向依赖它们。可重建产物只写入 .artifacts。


## 3. 依赖规则

    core 不依赖任何外层；Workspace、Journal、Todo 互不直接依赖。
    application 只依赖 core 和自身端口，不依赖 React、contracts、infrastructure 或 presentation。
    infrastructure 依赖 core、application 端口、contracts 与平台 API。
    presentation 可消费 core、application 和基础设施组合入口，但不被其它层反向引用。
    contracts 只复用纯 contract 基础或单一所有者的纯值约束。

补充约束：

    presentation/activities 不依赖 presentation/shell。
    application/workbench 与 application/agent 互不导入；领域不得依赖 Agent。
    infrastructure/client 内部依赖方向固定为：platform 只依赖 platform；repository
    只依赖 repository；http 可依赖 http 与 repository；runtime 作为组合根可依赖
    runtime、http、platform 与 repository。
    presentation 与其它浏览器侧源码不得导入 infrastructure/server；所有后端能力
    必须通过 infrastructure/client 的 HTTP/SSE adapter 调用 registry 声明的公开
    `/api/v3` 契约。是否同源、同端口或同一进程不改变该边界。
    Workspace 本地 repository 实现只依赖 repository 与 persistence 基础设施。
    生产依赖图无环；相对 import 必须能由 NodeNext 处理。


## 4. 内容 contract

CTN 编译、分析、失效与 multiline 语义的专门说明见
[CTN 分析流水线](ctn-analysis-pipeline.md)；本节只拥有各领域内容 contract 和
跨层传递边界。

Workspace v4：

    服务端从真实目录、可见 `.ctn` 正文、隐藏 sidecar 和 `.ctn/syntax/` 重建 canonical content；`.ctn/repository.json` 的 durable atomic replace 是提交点。

Journal v3：

    { schemaVersion, syntaxSource, days }
    day = { date, lastIssuedSequence, entries }
    entry = { id, createdAt, updatedAt, timezoneOffsetMinutes, sequence, source }

days 按日期升序，entries 按 sequence 升序。删除最后一篇仍保留空 day bucket，保证序号不复用。标题固定为 YYYY-MM-DD-0001。

Todo v4：

    { schemaVersion, syntaxSource, collections }
    collection = { id, source, completions, recurrences }
    completion = { blockId, completedAt }
    recurrence = { blockId, stages, completions }
    stage = { id, startsOn, endsBefore, rule }
    recurrence completion = { stageId, occurrenceDate, completedAt }

collections 数组顺序就是用户顺序。每个集合是一篇 CTN；标题是内部固定集合名，缩进形成任务树，完成状态只来自 sidecar。daily、weekly、monthly 规则只保存本地 YYYY-MM-DD，不保存时区或零点任务；当前状态、下一日期和完成/总数由运行环境本地日期投影。规则修改追加从下一天生效的阶段，停止周期也保留历史。移动与缩进保留 block ID，删除或失去 todo-item 语义的源码块清除孤立 completion 与 recurrence。

Workspace v4、Journal v3 与 Todo v4 是各自唯一可运行格式。只有 epoch 与内容
同时完全不存在时才初始化空内容；缺一项、非当前 epoch、损坏内容和未来版本
一律原样保留并 fail closed。运行时不存在版本 reader、迁移、字段别名或自动
重置。

Journal/Todo 的 synthetic title 参与 canonical 解析，但不进入公开可编辑正文。两者分别注入 wire codec、preparation/transition policy、revision factory 和 empty-content factory；基础设施不得恢复 purpose content union 或内容类型分派。


## 5. 数据可信与 preparation 边界

同一份内容依次经过四类边界，边界职责不得重叠：

    unknown ingress：contracts/api registry 是 HTTP request body 的唯一
    unknown → DTO 入口；HTTP client codec 与磁盘 reader 分别负责各自来源的 wire
    decode。内存 cache 接收 typed value，只做
    structuredClone 隔离；未来若改为持久化 cache，必须在反序列化入口重新 decode。

    typed handoff：decode 后只传递领域 Content。HTTP backend、cache、save queue
    和 store 写端口不得再次把 typed content 当 unknown 解析；外部 DTO、磁盘格式、
    schemaVersion 与 REST response 均不包含 projection。

    semantic preparation：VersionedContentPreparationPolicy 把 Content 准备为
    { content, projection }。Journal/Todo projection 是带
    Validated…ContentAnalysis 的 parse index；Workspace projection 统一包含 syntax
    编译结果、structure、parse index 与 context。client local-first repository 和
    server application use case 是各自信任边界内唯一的 write preparation owner；
    infrastructure store 只在读取持久化 before snapshot 时准备并按 SHA 缓存
    projection，写入口必须显式携带 `{ baseRevision, content, projection }`。客户端与
    服务端仍独立校验。projection 不序列化、不跨进程；revision/CAS 不匹配后不能
    复用旧 projection。

    transition authority：客户端 local-first repository 负责页面内 optimistic
    transition；服务端 store 在 CAS 锁内，以真正读到的 before 和
    待提交的 after prepared snapshot 执行 authoritative transition。commit receipt
    携带实际 before/after，事件投影直接消费 receipt。use case 可以先读 snapshot
    以增量准备 after projection，但该预读结果不是 authoritative before；若其后 CAS
    发生变化，store 必须拒绝事务，调用方重新加载和准备。

Agent preparation 不建立第二套领域 transition。Workspace、Journal、Todo 各自
公开 `prepareAgentCommand(snapshot, intent)`，只计算 staged after 和 projection，
不访问 store。第一条 intent 固定一个 versioned store 与 base snapshot，后续 intent
只消费前一 staged snapshot；最终 change set 和 diff 只比较原始 base 与最终
staged content。`commitAgentProposalExactly` 只接收已批准 proposal 内冻结的
`{ baseRevision, content, projection }` 并执行一次 CAS，禁止重新加载、重算、
自动重试或路径级 rebase。

领域命令通过 VersionedSessionController 唯一的 mutate 接口返回
`{ content, projection }`；增量 index 必须原样进入保存队列和 stageSnapshot。
query、search、resource projection 与 change projection 消费 store/session 已准备的
projection，不得重新建立全量索引。merge、冲突恢复和 working-tree reconciliation
生成新内容时只 preparation 一次，并用 analysis override 传递已经完成的单
note/entry/collection 分析。本地 store 在发布 repository metadata 提交点前完成完整
Workspace preparation；提交后的 validate 只检查读取完整性与 revision。


## 6. 存储与 API

HTTP 内置数据：

    <dataRoot>/repositories/.built-ins/journal/
    <dataRoot>/repositories/.built-ins/todo/

物理共用 dataRoot/repositories 不改变领域边界：.built-ins 是保留的基础设施
子树，不进入普通 Workspace catalog；Journal、Todo 仍使用各自的 contract、
versioned store、session 和 API，也不获得普通仓库的创建、删除、重命名、
切换能力。

前端始终通过 HTTP/SSE 访问 Server。浏览器状态的持久级别只有以下三类：

| 生命周期 | 状态 |
|---|---|
| Server durable | Workspace、Journal、Todo 内容，以及服务配置、凭据和账本 |
| browser localStorage | 当前普通仓库 ID、默认 Agent Profile ID |
| 当前页面会话 | 三领域 cache、draft、冲突，以及工作台宽度、折叠状态、Problems 布局、笔记模式和未提交表单 |

runtime 重建后从 Server 重新加载，不恢复当前页面会话状态。旧 IndexedDB 不属于运行时
输入，不读取、不迁移也不清理。

唯一 HTTP 契约为 `/api/v3`。contracts/api 的唯一 registry composition root
组合并校验 foundation、auth、content、sync、agent、admin operation catalog 的
operationId、method/path 与访问策略。`/api/v2`、公开 command endpoint、command
envelope、preview/commit mode、resource precondition、公开 commandId 和兼容
parser 都不存在。

`ApiErrorSchema` 是错误 code、DTO 与 parser 的唯一 wire owner；Server 的
`ApiErrorCatalog` 穷举 error class 到 status、retryable 与安全 details。客户端不得按
HTTP status 推测可重试性。`merge_conflict` 携带 store、base/current revision 与冲突
单元；`operation_audit_unavailable` 表示 CAS 尚未执行；
`operation_audit_finalize_failed` 明确携带 `commitState:"committed"` 和
`afterRevision`，调用方只能 GET 对账，不能重放 mutation。错误响应不得包含正文、
diff、secret、stack、提示词或 tool output。

request body 上限属于 operation definition：默认与既有 operation 为 20 MiB，三个
包含 base 与 local 双份 snapshot 的 sync PUT 为 42 MiB。Content-Length 与 streamed
body 使用同一个已匹配 operation 上限，不扩大其他 API 的输入面。

API principal 是严格 union，不共享“全部 scopes”：

    local-owner、owner：按 operation 的 owner policy 授权，不构造 scopes。
    automation：只能持有 workspace:read、journal:read、todo:read；Workspace
    继续受 repository ID allowlist 限制。
    trusted-client：可读取并同步全部当前及未来 Workspace、Journal 与 Todo；不能访问
    owner、Agent、admin 或 auth operation。
    agent-session capability：只存在于服务端私有 IPC，不属于 HTTP principal。

local-owner 同时要求 socket remote address 与 Host 都是 loopback；公共 Host 经过
loopback 反向代理不会提升权限。远程 owner 只来自签名 HttpOnly session Cookie，
owner credential 轮换分为 prepare 与 activate 两个 exact-CAS operation：prepare 只
替换无认证能力的 pending 摘要；activate 才提升 pending、递增 active credential
version、使旧 Cookie 失效；activate 必须回传 secret 作为持有证明，服务端在同一状态
candidate 上验证 pending digest 并签发新 Cookie。普通登录同样在一次权威读取中完成
secret 校验与 session 签发。提交结果未知时不会自动重试；调用端保留 prepare 已交付的
secret。Cookie 写请求还必须精确匹配设置中的 HTTPS Origin。Bearer 只属于 automation
或 trusted-client，显式无效 Bearer 一律 401。

每个 operation 只声明 `public`、`owner`、`content-read(domain)` 或
`content-sync`。授权矩阵穷举 principal 与 policy 的全部组合，未知 kind 默认拒绝；
不得使用“不是 automation 就是 owner”一类隐式分支。automation 只能调用
`/api/v3/content/*` 的已授权只读资源、搜索与无正文 change event；trusted-client
拥有全部内容读取与三个 sync operation，但不能取得 Agent、仓库管理、Provider、
系统设置或 owner-session 能力。

内容写入只有三个授权来源：owner 官方浏览器 sync、trusted-client 同步，以及已批准
Agent proposal。前两者共用服务端 merge-aware sync；Agent 始终使用冻结 proposal 的
exact CAS，revision 变化即 stale，不能进入自动合并。领域 transition、preparation 和
change projection 仍是内容语义的唯一 owner；HTTP handler、runtime、MCP、SSE、audit
和 presentation 不重建领域命令或变化。成功且 revision 实际变化时只生成并发布一次
DomainChangeSet；no-op、校验失败和 conflict 不发布 change event。

资源版本是内容 SHA-256；canonical block metadata 是 block createdAt/updatedAt
的唯一来源。Todo 正文、位置、completion 与 recurrence 语义变化都更新目标
block updatedAt，但并发判断不使用时间戳。

sync operation 接受经过验证的 base snapshot 与期望 content，先验证 base 正文与
revision 相符，再 direct commit 或执行 `merge(base, local, current)`；响应返回服务端
最终 snapshot 与 outcome，精确 wire schema 由 registry 独占。CAS 竞争最多重新读取并
计算三次，耗尽后返回可重试 `resource_conflict`。Workspace 以语法、树和单篇 note
为单元，Journal 以 entry 为单元，Todo 以 collection body、collection order、单任务
completion 和 recurrence 为单元三方合并；不同单元可自动合并，同一单元双改或删改
返回 `merge_conflict`。通用 merge equality 与本地优先 pending 判定共享同一结构比较
策略：对象键插入顺序不构成内容变化，数组顺序仍是领域事实；不得以原始
`JSON.stringify` 字节顺序制造伪冲突。
语法变化是 barrier，不能跨 grammar 自动合并。

浏览器发起同步时固定已提交内容 `L` 与 local revision `R`。响应 snapshot `S` 到达后，
若本地未变则安装 `S`；若已产生 `L2`，必须执行 `merge(L, L2, S)`，再以 local-revision
CAS 安装为基于 `S.revision` 的 pending。重叠时保存 `L/L2/S` 为本地 conflict；安装中
再次编辑最多重新计算三次，绝不能只把 `L2` 挂到新 revision。`conflict` 状态只有在
`base/local/remote/unitIds` 完整保存后才能发布；只取得远端 revision 或远端重读失败时
保留原 pending snapshot 并报告 sync error，不构造不可恢复的半冲突。服务端
`merge_conflict.currentRevision=C` 后的 GET 只有 revision 仍等于 `C` 才能使用旧冲突
单元，否则再次把原 base/local 交给服务端计算。刷新不会恢复尚未同步的 base 或
conflict。

冲突动作先由 VersionedSessionController 冻结 mutation、排空 local stage 并等待既有
sync，再读取完整 conflict snapshot，以其中 `{ localRevision, remoteRevision }` 作为
exact proof。repository 在同一解决操作中校验证明、rebase 并继续同步；会话直接安装
返回 transition chain 的最终 snapshot，不通过普通 reload 猜测结果。若 rebase 后同步
失败，新的本地权威 snapshot 与明确 sync error 一并交接，不能退回旧 conflict；若远端
再次形成重叠修改，则必须返回另一份完整 conflict snapshot。

完整 conflict 一经发布，普通编辑与 save-queue enqueue 均关闭，直到显式解决完成；
同步期间已经进入 stage 的 mutation 仍由 local-revision CAS 串行化，并原子重算当前
local 与 conflict units，不能把旧 unit list 绑定到新正文。“远端并另存本地”的领域
transform 必须返回 covered unit ids，repository 在任何 rebase 前验证其与当前全部冲突
单元完全相等；syntax、tree、identity、order、completion、recurrence、删除或混合单元
只要无法无损表达，就整体拒绝，不允许以部分正文副本冒充成功。

`application/sync` 是通用协调器，只消费组合根注入的 `revisionOf`、`prepare`、
`merge`、`projectChanges` 与 prepared store port，不导入三个内容领域、HTTP 或
基础设施。trusted-client 先提交会使既有 Agent proposal stale；Agent 先提交后，
trusted-client 的非重叠变更可合并，重叠变更仍返回冲突。

SSE 只发送带
`streamId` 的 checkpoint 与无正文 change set；sequence 只在同一 stream
内部有序，进程重启产生的新 stream 会使客户端重置去重状态。轻量 revision
tracker 维护 checkpoint，建立连接不会扫描仓库正文。

`/api/v3/agent/sessions/{sessionId}/events` 是另一条会话专属 SSE：message delta、
proposal、problem、turn completion 与必要的 snapshot 使用单调 sequence。浏览器
只增量应用连续事件；发现缺口、越界 cursor 或刷新重连时重新读取
AgentSessionSnapshot。两类 SSE 都不是正文真值来源。

固定控制区与数据状态各有唯一 owner：

    <项目根>/.cognition-tree/bootstrap-v1/configuration.json
    <dataRoot>/server/access-v1/automation-tokens.json
    <dataRoot>/server/access-v1/trusted-client-tokens.json
    <dataRoot>/server/agent-auth-v1/providers/<providerId>/
    <dataRoot>/server/agent-config-v1/configuration.json
    <dataRoot>/server/operations-v1/operations.json

access 分区分别保存 automation 与 trusted-client token 的 SHA-256 哈希；前者保存
只读 scopes 和 Workspace allowlist，后者固定为全部内容读写。agent-auth 分区独占
API Key 与 Codex 托管登录态，agent-config 分区只保存 provider、profile、认证模式、
凭据引用/version/digest 与符合性结果。

operations-v1 在一个原子状态中分离 `auditEntries` 与 `agentReceipts`。受审计 mutation
先以短事务持久化认证尝试，body 解码后再附加 store、base revision 与 intent digest；
释放账本锁后才执行内容 CAS，发布真实 change event，最后以短事务写终态。任一写前
步骤失败都不得越过对应 CAS 边界；CAS 已成功但 finalize 失败则内容不回滚，pending
记录保留并返回明确对账错误。不同内容 operation 的 CAS 可并发，账本锁只保护短暂
状态替换。

Agent receipt 唯一键仍为 proposal UUID + version，并校验 digest；同进程 pending
请求复用 promise，已完成同 digest 返回原 receipt，不同 digest 冲突，重启后孤立
pending 标记为 indeterminate 且禁止重放。receipt 在 24 小时会话生命周期后清理，
不受审计展示容量直接裁剪；auditEntries 才按“设置 → 服务”的操作审计保留条数裁剪。
账本不保存提示词、模型回复、正文、完整 diff、secret 或 tool output。初始化状态通过
capabilities 与 admin status 投影；不可用时 Agent 与 trusted-client fail closed，本地
浏览器 autosave 继续可用。

权威切换时只安全删除旧 `<dataRoot>/server/agent-v2/operations.json` 与
`<dataRoot>/server/api-v1/audit.json`；`api-v1/tokens.json`、agent-v1、Agent 配置、凭据
与内容不删除也不读取为新账本。删除目标必须是预期目录中的普通文件并拒绝符号链接；
删除失败使新账本 unavailable。状态目录权限为 0700、文件权限为 0600。
bootstrap 固定在项目根，独占监听、端口、数据根指针、public origin、宿主机显示路径、
审计容量，以及唯一 owner credential 聚合中的 active digest、active version 和至多一个
pending rotation；配置使用 exact CAS，v1 摘要/version 无损迁入 v2 聚合，损坏时只启动
本机 recovery registry。LAN 前置条件、secret 认证与 session 校验只读取 active，clear
同时清除 active 与 pending。SystemAdministrationService 串行化配置更新；bootstrap
提交是唯一持久权威，审计容量是可即时应用的运行时投影。投影失败不得回滚或隐藏已经
提交的配置，而应保留旧 effective 值，并通过快照的 `runtimeApplyErrorMessage` 与
`restartRequired` 显式暴露。

数据根迁移由 application/workbench 的 loaded-content flush、application/system 的
迁移用例和 infrastructure/system 的迁移状态协调器共同完成。状态协调器只编排维护
租约、copy/verify/bootstrap CAS 与重启；独立文件事务是目标路径校验、权威分区清单、
复制、指纹校验和失败清理的唯一 owner。maintenance gate 阻止新 mutation 并等待已有
请求结束；文件事务只复制[使用与部署](getting-started.md#4-数据控制区与迁移)列出的当前
权威分区，拒绝符号链接与路径重叠，逐文件校验数量、大小和 SHA-256，最后才 CAS 更新
bootstrap 指针。失败不切换指针；目标清理失败会附加到失败状态，但不能阻止维护租约
释放和 active 状态归零。成功通过专用退出状态由根 supervisor 重启。
旧数据根不删除。

Todo 查询中 recurrence 非 null 只表示存在周期历史，只有 active 才表示当前
周期。inactive recurrence 保留 completedCount/totalCount，但完成状态与写入按
普通任务处理并使用 occurrenceDate null；active 只能提交服务端给出的
currentOccurrenceDate。


## 7. Application 协调

每个内容领域拥有独立 session 和状态，但统一复用 application/persistence 的
VersionedSessionController 与保存队列。该控制器负责页面内 ready 内容保持、
并发 reload、discard 失败恢复、乐观 draft、CAS、冲突、断线重试、dispose 和
删除前冻结/恢复；冲突详情读取失败与整仓冲突是不同状态，解决动作只消费完整冲突
快照。Workspace、Journal、Todo wrapper 只注入 preparation policy 与领域命令。
普通仓与内置仓 catalog controller 各自拥有 reload generation；并发刷新只允许最新
结果发布，stop 会使在途启动刷新失效，后台启动错误必须已投影到状态且不能逃逸。
普通仓库切换只排空并替换 Workspace session，不
停止或重建 Journal/Todo。

application/workbench/WorkbenchController 提供 start、dispose、subscribe、
getSnapshot 与明确 facade。snapshot 只包含不可变状态，不嵌入可变 controller；
查询和操作只能经 facade 执行。它组合 RepositoryCatalogController、Workspace
session slot、Journal/Todo built-in slot、SearchIndex、引用解析与跨仓导航
状态机，并独占以下跨领域流程：

    普通仓库切换与一次性导航。
    Journal 的 [[仓库名:笔记名]] 解析。
    按需读取命名普通仓库的 session snapshot，只从 canonical note header 建立标题索引。
    排空当前 Workspace、切换仓库、等待新 session，再进入 Notes 并选择目标笔记。
    把三领域 ContentDestination 映射到 Activity、资源和稳定 block ID；目标块
    已消失时只在该边界回退到资源首行并报告结果过期。

application/agent 独立提供 AgentRuntimePort、AgentSessionController、scope policy、
staging 与 proposal state machine。它只依赖三个领域公开的 Agent preparation 入口
和通用 persistence 端口，不依赖 contracts、infrastructure、presentation 或
application/workbench；AgentRuntimePort 同时定义与 provider 无关的上下文预算耗尽
语义。浏览器的 AgentClientController 只消费 wire-neutral port；
发送、批准和 destructive confirmation 前所需的已加载 draft 同步由 AppRoot 在
presentation composition root 注入，避免任一应用协调根反向调用另一个。

一份 proposal 只允许一个 Workspace repository、Journal store 或 Todo store；跨
store 意图必须顺序生成多份 proposal。proposal 是带 UUID、version、SHA-256
digest、base revision、change set、最终 diff、冻结 review 与 destructive 标记的
只读值，只能整批批准或拒绝。各领域 projection 从同一原始 base 与最终 staged
projection 生成资源标题/路径、语义动作、块计数和带有限上下文的行 diff；review
进入 proposal v2 digest，presentation 只渲染它，不重新解析 CTN 或请求模型总结。
Workspace 仓库名称无法解析时 proposal fail closed，不回退显示 repository ID。任意
store revision 变化使其 stale；删除批准后必须再经过独立 destructive confirmation。

application/search/SearchIndex 是三领域资源投影、Unicode 归一化、grapheme
源码偏移、片段、过滤、排序、fault 与 cursor 的唯一 owner。过滤在命中折叠前
执行；缓存按来源 revision 和 corpus key 失效，查询 LRU 有界。presentation
只提交 SearchQuery 和打开 ContentDestination，不解析 CTN、扫描仓库或换算
行号。

Journal 只理解日记内容、仓内引用和外部引用 token；Todo 只理解 CTN collection、任务结构和 completion。跨仓边不进入普通引用图谱，重命名也不跨独立 CAS 改写 Journal。

application/repository/RepositoryCatalogController 独占 catalog 加载、活动仓库持久化、创建/重命名/删除期间的并发保护和 descriptor 复用。Workspace session 只管理生命周期、authoritative state 与保存队列；语法目录的创建、复制命名、启用、删除和 metadata reconcile 由独立 mutation service 计算。

Application 只声明 scheduler、时钟、ID 与生命周期端口；浏览器 UUID、时间、页面事件和定时器实现由 infrastructure 注入。Problems 的选择与合并留在 application，Activity 切换和 DOM 聚焦只由 presentation 执行。


## 8. Infrastructure 内部边界

    client/platform 只拥有 UUID、时间、调度，以及当前仓库和默认 Agent Profile 的
    localStorage 偏好；
    client/repository 拥有内存 catalog/content cache、revision 与 resilient
    repository；其中 resilientVersionedRepositoryProjection 独占 prepared local/remote
    projection cache、merge-base 复用和 snapshot/transition 投影，resilient repository
    状态机只通过其公开方法交接 prepared value；resilientVersionedRepositoryPolicy
    独占远端错误分类、cache fallback、内容等价和冲突单元规范化；client/http 只实现
    /api/v3 transport 与两类 SSE；client/runtime 只负责把
    这些实现注入 application 端口。源码中不存在 IndexedDB 或存储模式分支。
    server/persistence 统一 durable replace、目录 fsync、临时文件清理和安全文件检查。
    repository/workspace/local 分为 layout、codec、canonical projection、物理扫描与身份匹配、managed-data guard，以及 WAL state、planner、manifest、executor、recovery 和 commit coordinator。state 只捕获/比较工作树并检查待删目录；executor 只应用与回滚已验证 payload；recovery 只解释启动时 WAL；workingTreeTransaction 只组织 staging、阶段回调和 repository.json 提交点。localRepositoryRootLease 独占 canonical root、writer lock、丢失检测与启动时 staging/tombstone 清理；localRepositoryInventory 独占目录枚举、metadata/identity 校验、问题分类与 label issue 投影；LocalRepositoryCatalog 独占稳定 ID 分配、名称约束与 store 组合。
    localRepositoryDeletion 独占普通仓库删除的 managed-data 校验、durable tombstone
    rename 提交点、失败回滚与可恢复物理 cleanup；catalog 只先排空驻留 store 并委托。
    API server 的 api/http 拥有 request lifecycle、认证、限制和 registry 分派；
    transport 在 wire schema 前执行 operation-specific 字节上限与 fatal UTF-8 解码，
    非法字节不得以替换字符进入 JSON 或内容摘要；未完成的上传由 transport 投影为
    request-aborted 生命周期事件，handler 不得将客户端断连伪装成 API 500；
    error mapping 与响应 envelope 仍是 handler 的权威事实，日志仅为经脱敏的
    非权威观测，logger 失败不得替换或拒绝既定 API 响应；
    api/http 独占 SSE socket 的失败与 backpressure 隔离，单个慢连接直接断开
    并依赖 checkpoint/replay 重同步，不得反向改变提交、Agent turn 或其他订阅者；
    serverLifecycle 将关闭拆成停止接收、结束两类长连接、等待活动请求或限时强制断连、
    最后释放请求依赖资源四个有序阶段；多项关闭失败必须全部保留，不能让资源清理与
    尚未结束的 handler 并发；
    server/state 独占安全状态目录的类型、权限与创建持久性；首次递归创建必须从目标
    向上逐级 fsync 至原有祖先，不能只同步最终状态文件所在目录；
    api/resources、api/sync 分别拥有只读资源投影与 merge-aware snapshot 同步，search
    保持独立查询入口。server/access 独占 automation 与 trusted-client token；
    server/operations 独占统一账本、审计状态和 Agent receipt；其中
    operationLedgerContract 独占公开错误与命令类型，operationLedgerState 独占
    operations-v1 严格解析与初始状态，operationLedgerProjection 独占 Agent/trusted
    审计 wire 投影与稳定 operation key，operationLedgerStore 独占安全分区、串行化、
    可用性、容量与旧文件清理，trustedClientOperationLedger 独占 trusted-client 的
    begin/attach/finalize 事务，agentOperationLedger 独占 in-flight 去重、持久 receipt、
    retention 与 terminal/indeterminate 流程，operationLedger 只作为显式组合根和公开
    façade；
    server/agent 拥有
    store 组合、runtime adapter、私有 IPC 与内存会话，不重写领域 command；其中
    providerOperations 只显式组合无状态 providerProbe、Codex 设备码登录状态机和
    conformance 状态机，并统一拒绝关闭后启动的新操作；后两者分别独占自身记录、
    启动预留、执行任务与幂等释放；
    configurationErrors、configurationInput 与 configurationViews 分别独占配置错误、
    stored input 归一化和 digest/read-model 投影，configurationStore 只组合事务、
    credential/access 生命周期与这些纯策略；configurationRevision 独占 revision CAS
    断言，profileConfiguration 通过显式 mutation port 独占 Profile CRUD 与 conformance；
    providerConfiguration 通过显式 read/mutation ports 独占 Provider CRUD、认证候选、
    device-code staging/activation、change lease 与 conformance 失效；
    privateIpc 独占 capability 与本地监听器，并线性化并发启动和幂等关闭；
    Agent service 关闭门统一阻止新 session 与 owner mutation，并协调 owner 操作、
    session pool、turn queue 与 IPC 的关闭顺序；sessionOpener 独占配置租约、启动校验、
    Profile 容量 reservation 的持有/释放、private IPC capability、runtime open、发布和
    失败回滚；sessionPool 独占驻留表、Profile 容量计数、过期驱逐、runtime
    stop/dispose 和 configuration use 释放；
    conversationRunner 独占普通对话、提交回执、工具执行、上下文压缩和取消收尾的
    turn 编排，内部 profileTurnQueue 独占跨 session 的 Profile FIFO、排队判定与直到
    真正空闲的关闭等待；
    proposalWorkflow 独占 owner 决策、破坏性二次确认、包含 `indeterminate` 的终态
    session 投影和回执调度；
    proposalCommitter 独占 Agent exact-CAS、幂等账本、审计 receipt 与提交后的
    revision/event 发布，并把存储提交未知或既有 indeterminate receipt 统一投影为
    workflow 可识别的提交边界错误；service 只定位 session、跟踪 owner operation 并
    转发参数；
    sessionEventStream 独占 session SSE sequence、重放窗口和终态关闭，关闭后不再接收
    事件或连接；
    sessionToolProtocol、sessionToolState 与 proposalCodec 分别独占模型工具映射、会话
    staging 形态和 Proposal wire/digest，Workspace/Journal/Todo session tool adapter
    分别独占本领域资源读取、scope 校验、staging 与 review 投影；sessionTools 只负责
    公共工具执行和三者的显式组合；AgentRuntimeProtocolError 由 application runtime
    port 独占，基础设施 adapter 只消费这个中立失败语义；openAiChatProtocol 独占
    OpenAI-compatible SSE、tool envelope 与 correction 的纯协议规则，
    openAiCompatibleSession 独占有状态 turn lifecycle，openAiChatRuntime 与
    ollamaRuntime 只作为各自 profile 的显式组合根。
    repository/built-ins、repository/versioned、repository/workspace 分别拥有
    系统内容、通用版本存储和 Workspace 持久布局。只有 contracts/api registry
    定义 HTTP wire；只有 owner/trusted-client sync 与 Agent exact commit 可以写内容。

这些模块只拆职责，不改变本地 WAL 提交点或仓库内容 schema。普通仓库没有第二种
存储实现、组合 catalog、连接 registry 或存储回退路径。

Agent 配置由 application/agent 端口协调、设置界面操作并写入独立的 versioned 服务端状态；
session lifecycle policy 独占[产品需求](product-requirements.md#8-agent)定义的
idle/absolute TTL 实现，审计容量来自 bootstrap 服务设置。每个 profile 显式声明
maxResidentSessions、model、timeout 与 tool/request limit；chat profile 的
`historyBudgetCharacters` 只是服务端内存会话历史的字符预算，不是模型 token 上限，
也不会设置 Ollama `num_ctx`。凭据只写入不回读；Provider 只激活 `none`、API Key 或
ChatGPT 设备码中的一种认证，清除认证只能走专用 owner operation。
aggregate、provider 和 profile 均有 version/digest，管理 mutation 使用 exact CAS。
会话固定创建时的有效配置；配置访问门从 profile 解析前建立 use lease，绑定解析到的
provider，并延续到 runtime dispose。普通 profile 修改不影响旧会话；opening/resident
session 会阻止对应 provider、凭据和 profile 删除。Provider mutation 在配置 candidate、
凭据切换与旧凭据回收期间持有互斥 change lease，因此管理 API 的预检查不是权威。
单个 profile 无效或缺少 secret 时只禁用该 profile，
不回退到其它 profile。每个 profile 同时只运行一个推理，turn FIFO；每个 session 同时
只有一个 active turn，达到 resident 上限时拒绝新会话而不驱逐有效会话。

Provider 私网许可不是全局 policy：loopback 自动允许，其他私网 origin 必须在每次
Provider 创建或修改时显式确认，并进入该 Provider version/digest。推理、probe 和
conformance 每次请求前重新解析目标；metadata、link-local、unspecified、multicast
与混合 DNS 结果不可被确认绕过。endpoint 变化清除许可和符合性。

Codex adapter 精确锁定 `@openai/codex@0.148.0`。API Key 通过 app-server
`account/login/start` 注入单次会话的临时 CODEX_HOME，不进入子进程环境；ChatGPT
设备码登录使用应用管理的隔离 CODEX_HOME，成功后以配置 base revision 执行 exact
CAS；登录从 prepare 到 terminal 状态持有对应 Provider 的 change lease。失败、取消、
过期或已确定冲突会撤销 staging；durable commit 结果未知时保留可能已成为权威的
manifest 与 HOME，重启后以权威配置引用核验并回收孤儿。登录进行中和 opening/resident
session 都会阻止 Provider、认证与数据根迁移的危险变更。TTL 取消、完成通知和显式取消
都是登录操作 owner 持有的 terminal task；关闭必须等待这些任务并继续回收全部子进程，
后台清理失败留存到关闭结果，不能成为无主 Promise rejection。无论认证方式，每条会话都启动独立常驻
app-server，使用空临时 cwd、隔离 HOME/CODEX_HOME、`ephemeral: true`、只读
filesystem、network disabled、approval never，并验证 instructionSources 为空；不
读取个人 `.codex`、AGENTS、skills、hooks、plugins、sessions 或 MCP。进程环境是
allowlist，API key 不进入 shell/MCP environment。缺少 sandbox、binary/version
不匹配或协议结果不满足这些断言时 profile fail closed。Codex app-server notification
按到达顺序交付 runtime event，`turn/completed` 必须等待此前异步 event handler 完成；
handler 失败直接使 turn 失败。会话结束、过期或取消后
撤销 capability、停止进程，并只清理服务为该 session 建立的临时目录。

Codex 的会话专属 STDIO MCP 只定义 scope 内 list/read/search、describe_syntax、
submit_proposal，
以及当前领域的独立 staging 动作：Workspace 9 个、Journal 3 个、Todo 11 个。
动作名拥有 intent kind，参数不再重复 kind；每个模型侧 JSON Schema 都以严格
object/properties 为顶层，recurrence 的 daily、weekly、monthly 也各自独立。MCP 的
tools/list 必须用会话 capability 从父服务取得这个范围化 catalog，不能持有全局
静态工具表。MCP 进程不导入 repository/store，只通过
Unix domain socket 或 Windows named pipe 连接父服务私有 IPC，并携带单会话短期
capability。list 不接收参数，read 只接收 resourceId；领域、仓库和细粒度范围始终
从不可变 session scope 派生，模型不能重复提交或覆盖范围事实。私有 IPC 持有每个
request task；即使客户端提前断开，关闭 listener 后仍等待 handler 终结，再清理 socket
目录。OpenAI-compatible
adapter 直接消费同一 contracts/agent tool schema，
使用 `/chat/completions` SSE。Ollama adapter 直接连接模型服务的 `/v1/chat/completions`，
不调用本地代码 Agent 的 task API、MCP、Git、shell、ChangeSet 或审批层。native 与
Ollama-only single-json 都由 runtime 分类，presentation 只消费最终字符串。一个
completion 返回多项调用、未知工具、参数不满足 schema，或文本工具信封不符合当前
模式时，runtime 一个都不执行，只把省略原始正文和完整参数的结构化错误写回私有模型
历史，并要求逐项纠正；纠正仍受 maxToolSteps 限制。工具信封、错误与工具结果都不
生成聊天 delta，最终失败会移除空 assistant 消息。runtime 直接统计序列化会话历史
字符数决定压缩，不做字符数除以四的伪 token 换算；output/tool-step limit 与 timeout
继续独立生效。OpenAI-compatible 流只把非空 `content` 作为最终对话，Ollama 的
`reasoning` 仅在当前工具循环的内存历史中连续传递，不形成 SSE、聊天气泡、日志或
审计。`stop` 必须带自然语言正文，`tool_calls` 必须带唯一合法调用；`length`、过滤、
缺少终止帧和空 completion 均产生 Agent Problem，零执行且不隐藏重试或 fallback。
项目不建立公开 MCP，也不监听外部 MCP endpoint。

CTN 写作语法由内容 store 独占，不固化在 prompt、runtime 或模型知识中。
`describe_syntax` 从当前 staged projection（没有 staging 时从当前 store snapshot）
投影名称、标题边界、tab 缩进宽度、root/block/inline 规则和最小示例，并把已读的
owner + presentation fingerprint 记录在会话内。create/replace 正文工具只有在该
fingerprint 仍匹配时才可进入领域 preparation；否则返回私有
`syntax_read_required` 并零 staging。普通 read 响应剥离重复 writing guide，确保
此工具是唯一语法知识入口。

agent-config-v1 的格式升级由安全状态分区执行一次原子权威切换；先完整解析和验证，
失败时 fail closed，不留下部分配置。当前 API 只接受当前字段和非 null write-only
API Key，不提供兼容 reader。Profile digest 同时包含 tool-contract 与
completion/conformance contract version，因此任一契约变化都会使旧 conformance 失效。
当前格式和逐版本升级步骤由[使用与部署](getting-started.md)记录。

Ollama Provider 的显式 probe 复用 SSRF、超时、重定向和响应体限制，只查询发现、
驻留与模型元数据。结果只驻留客户端配置状态，不修改 Profile、不发送推理请求、
不触发模型加载；具体操作与显示字段由使用与部署和界面规范分别拥有。


## 9. Presentation 与 Problems

本节只说明 Presentation 所有权与跨层边界；精确布局、交互、尺度和颜色由
[界面规范](ui-guidelines.md) 独占。

AppRoot 只创建 runtime/controller、订阅快照并维护当前 Activity。领域 session 到
view application 的组合位于 `presentation/shell/application`；Activity descriptor
catalog 是 ID、标签、图标、分组、可用条件与懒加载元数据的唯一 owner。

每个 Activity 采用纵向切片：controller、context、view、局部 hook 和样式位于
`presentation/activities/<activity>/`。跨 Activity 的组合只存在于 shell，共享交互
原语只存在于 `presentation/ui`；Activity 只组合领域内容、局部 Presentation 状态和
回调，不复制应用状态或领域命令。

`ToolSurface` 拥有高密度工具页面的面板、分区、属性表、工具栏和基础列表；普通控件、
详情壳与 CTN 编辑器分别由 `presentation/ui/shared`、`DetailPanel` 和 CodeMirror adapter
独占。`ActivitySlots` 只声明 context、main 与可选 detail 内容，AppFrame 独占工作台
尺寸、折叠和专注模式。页面不得实现第二套详情壳或跨 Activity 布局状态。

Activity 内部仍按语义拆分独立 view：Repository 的 catalog、状态、恢复与危险操作，
Todo 的集合、编辑与周期结构，以及 Notes 的编辑、结构与图谱不因视觉相似而共享业务
状态。引用图谱 Canvas 只声明 DOM 并接收当前仓库 session 选出的 controller；模拟、位置
缓存、缩放和平移属于专用 hook/controller，controller cache 不得成为模块级全局状态。
核心引用图只包含语义数据；Application 投影以源图对象身份标识一次拓扑，禁止在纯
core 中用全局计数器制造展示缓存 revision。

Agent Presentation 只消费 AgentClientController 的会话快照、连续事件和冻结 proposal
review，不解析正文或生成审批摘要。发送、批准与 destructive confirmation 前的 scope
同步由 AppRoot 作为组合根注入；事件序列出现缺口时重读 session snapshot。Provider、
Profile、凭据与符合性状态只经 Settings application facade 管理。

Settings 的页内选择和未提交表单、Search 的查询草稿、Notes 的模式/图谱筛选/图谱设置
以及工作台布局都属于 Presentation 页面会话状态；需要跨仓库保留的状态由显式
repository session store 分区，React hook 只订阅当前仓库；不得用模块级 Map 建立第二个
页面会话 owner，也不得进入领域 content 或服务端配置。write-only secret 随对应表单卸载
而清除；服务端 pending 操作具有独立生命周期，不由页面卸载取消。

`application/problems` 的 ProblemCenter 是运行期 operational incident 的唯一 owner。
API、Agent、同步、Settings 与 UI action 只通过 `ProblemReporter` 上报结构化安全信息；
ProblemCenter 负责指纹聚合、最近 requestId、时间、次数、200 项容量和页面生命周期。
领域 diagnostics 继续由源状态派生，不复制进 ProblemCenter。

Presentation shell 在全部 Activity 合并 diagnostics、可恢复状态故障与 operational
incidents；筛选只改变展示。问题导航只能进入拥有恢复能力的 Activity，不能执行 mutation
或盲目重试。五秒 transient feedback 同样由 ProblemCenter 调度，稳定保存不生成文案。

编辑器只接收 editable source、语义角色和展示数据。canonical 页面消费 application 已
准备的 syntax、document 与 parse index；只有未保存 draft 可在 editor adapter 内分析。
缺少已准备 syntax 时使用显式 raw/unavailable 状态，不构造默认语法。CTN parser、
multiline lexical 范围与 decoration 语义由
[CTN 分析流水线](ctn-analysis-pipeline.md)独占，Presentation 不重建。
