# 架构边界


## 1. 领域

    Workspace：零个或多个普通笔记库。
    Journal：全局唯一的日记库。
    Todo：全局唯一的代办库。

三个内容领域互不直接依赖，也不继承统一文档库模型。它们只共享 CTN、可移植名称和值无关的 versioned persistence。Repository 不是内容领域，只管理普通 catalog、内置数据 descriptor、位置、故障和运维。


## 2. 源码层次

core/

    纯领域代码。core/ctn 提供解析、metadata reconcile、引用与 syntax；core/naming 提供名称值和唯一键；core/workspace、journal、todo 分别拥有自己的内容、命令、查询与 transition。

application/

    框架无关的用例、端口、session controller、read model 和问题投影。application/persistence 持有通用 VersionedRepository、保存队列和 VersionedSessionController。跨内容领域协调只允许两个显式且互不导入的根：application/workbench 拥有工作台、跨仓导航、保存前 flush 和搜索组合；application/agent 拥有硬范围、runtime port、staging、proposal、审批状态机与 exact commit 用例。application/system 只拥有启动配置用例、端口和状态机，不感知内容领域。

infrastructure/

    client 侧内存 cache、HTTP/SSE 适配、Node server、本地 working-tree repository，
    以及 Agent profile、模型 adapter、Codex 子进程、私有 IPC、内存会话和
    operation ledger。CAS 与保存队列策略属于 application，平台层只实现端口；
    client 不直接导入任何 Server 实现。Node 是开发与生产的唯一 HTTP composition
    root；浏览器与 API 同源，客户端只使用相对 `/api/v3`，不存在独立启动配置或
    客户端 owner token。同端口、同进程只是运行与部署事实，不授予前端调用服务端
    内部模块的能力。

presentation/

    React bindings、AppRoot、Activity Controller/View、CodeMirror 与共享 UI。React hooks 只存在于这一层。

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

days 按日期升序，entries 按 sequence 升序。删除最后一篇仍保留空 day bucket，保证序号不复用。标题固定为 YYYY-MM-DD-0001；UI 只从 date 派生年、月，并直接显示条目，不显示 day 分组。

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

Journal/Todo 的 synthetic title 仍参与 canonical 解析，但 presentation 不显示标题语法配置。两者分别注入 wire codec、preparation/transition policy、revision factory 和 empty-content factory；基础设施不得恢复 purpose content union 或内容类型分派。


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

前端始终通过 HTTP/SSE 访问 Server。Workspace、Journal 与 Todo 各自拥有页面
生命周期内的内存 cache、draft 和冲突；runtime 重建后从 Server 重新加载，不
恢复未同步状态。localStorage 只保存当前普通仓库 ID。旧 IndexedDB 不属于
运行时输入，不读取、不迁移也不清理。

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
credential version 轮换立即使旧 Cookie 失效，Cookie 写请求还必须精确匹配设置中的
HTTPS Origin。Bearer 只属于 automation 或 trusted-client，显式无效 Bearer 一律 401。

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

sync PUT 只接受 `{ base: { revision, content }, content }`，先验证 base 正文与
revision 相符，再 direct commit 或执行 `merge(base, local, current)`；响应返回
`{ outcome, snapshot }`。CAS 竞争最多重新读取并计算三次，耗尽后返回可重试
`resource_conflict`。Workspace 以语法、树和单篇 note 为单元，Journal 以 entry
为单元，Todo 以 collection body、collection order、单任务 completion 和 recurrence
为单元三方合并；不同单元可自动合并，同一单元双改或删改返回 `merge_conflict`。
语法变化是 barrier，不能跨 grammar 自动合并。

浏览器发起同步时固定已提交内容 `L` 与 local revision `R`。响应 snapshot `S` 到达后，
若本地未变则安装 `S`；若已产生 `L2`，必须执行 `merge(L, L2, S)`，再以 local-revision
CAS 安装为基于 `S.revision` 的 pending。重叠时保存 `L/L2/S` 为本地 conflict；安装中
再次编辑最多重新计算三次，绝不能只把 `L2` 挂到新 revision。服务端
`merge_conflict.currentRevision=C` 后的 GET 只有 revision 仍等于 `C` 才能使用旧冲突
单元，否则再次把原 base/local 交给服务端计算。刷新不会恢复尚未同步的 base 或
conflict。

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
审计容量和 owner credential 摘要；配置使用 exact CAS，损坏时只启动本机 recovery
registry。

数据根迁移由 application/workbench 的 loaded-content flush、application/system 的
迁移用例和 infrastructure/system 的文件协调器共同完成。maintenance gate 阻止新
mutation 并等待已有请求结束；协调器只复制 repositories、access-v1、agent-auth-v1、
agent-config-v1 和 operations-v1，拒绝符号链接与路径重叠，逐文件校验数量、大小和
SHA-256，最后才 CAS 更新 bootstrap 指针。失败不切换指针；成功通过专用退出状态由
根 supervisor 重启。
旧数据根不删除。

Todo 查询中 recurrence 非 null 只表示存在周期历史，只有 active 才表示当前
周期。inactive recurrence 保留 completedCount/totalCount，但完成状态与写入按
普通任务处理并使用 occurrenceDate null；active 只能提交服务端给出的
currentOccurrenceDate。


## 7. Application 协调

每个内容领域拥有独立 session 和状态，但统一复用 application/persistence 的
VersionedSessionController 与保存队列。该控制器负责页面内 ready 内容保持、
并发 reload、discard 失败恢复、乐观 draft、CAS、冲突、断线重试、dispose 和
删除前冻结/恢复；Workspace、Journal、Todo wrapper 只注入 preparation policy 与
领域命令。普通仓库切换只排空并替换 Workspace session，不
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
application/workbench。浏览器的 AgentClientController 只消费 wire-neutral port；
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

    client/platform 只拥有 UUID、时间、调度和当前仓库 localStorage 偏好；
    client/repository 拥有内存 catalog/content cache、revision 与 resilient
    repository；client/http 只实现 /api/v3 transport 与两类 SSE；client/runtime 只负责把
    这些实现注入 application 端口。源码中不存在 IndexedDB 或存储模式分支。
    server/persistence 统一 durable replace、目录 fsync、临时文件清理和安全文件检查。
    repository/workspace/local 分为 layout、codec、canonical projection、物理扫描与身份匹配、managed-data guard，以及 WAL state、planner、manifest、executor、recovery 和 commit coordinator。state 只捕获/比较工作树并检查待删目录；executor 只应用与回滚已验证 payload；recovery 只解释启动时 WAL；workingTreeTransaction 只组织 staging、阶段回调和 repository.json 提交点。LocalRepositoryCatalog 独占稳定 ID 分配、名称约束、目录枚举、受控删除与 store 组合。
    API server 的 api/http 拥有 request lifecycle、认证、限制和 registry 分派；
    api/resources、api/sync 分别拥有只读资源投影与 merge-aware snapshot 同步，search
    保持独立查询入口。server/access 独占 automation 与 trusted-client token；
    server/operations 独占统一账本、审计状态和 Agent receipt；server/agent 拥有
    store 组合、runtime adapter、私有 IPC 与内存会话，不重写领域 command。
    repository/built-ins、repository/versioned、repository/workspace 分别拥有
    系统内容、通用版本存储和 Workspace 持久布局。只有 contracts/api registry
    定义 HTTP wire；只有 owner/trusted-client sync 与 Agent exact commit 可以写内容。

这些模块只拆职责，不改变本地 WAL 提交点或仓库内容 schema。普通仓库没有第二种
存储实现、组合 catalog、连接 registry 或存储回退路径。

Agent 配置由 application/agent 端口协调、设置界面操作并写入独立的 versioned 服务端状态；固定 1 小时 idle TTL、
24 小时 absolute TTL，审计容量来自 bootstrap 服务设置。每个 profile 显式声明
maxResidentSessions、model、timeout 与 tool/request limit；chat profile 的
`historyBudgetCharacters` 只是服务端内存会话历史的字符预算，不是模型 token 上限，
也不会设置 Ollama `num_ctx`。凭据只写入不回读；Provider 只激活 `none`、API Key 或
ChatGPT 设备码中的一种认证，清除认证只能走专用 owner operation。
aggregate、provider 和 profile 均有 version/digest，管理 mutation 使用 exact CAS。
会话固定创建时的有效配置；普通 profile 修改不影响旧会话，resident session 会阻止
provider、凭据和 profile 删除。单个 profile 无效或缺少 secret 时只禁用该 profile，
不回退到其它 profile。每个 profile 同时只运行一个推理，turn FIFO；每个 session 同时
只有一个 active turn，达到 resident 上限时拒绝新会话而不驱逐有效会话。

Provider 私网许可不是全局 policy：loopback 自动允许，其他私网 origin 必须在每次
Provider 创建或修改时显式确认，并进入该 Provider version/digest。推理、probe 和
conformance 每次请求前重新解析目标；metadata、link-local、unspecified、multicast
与混合 DNS 结果不可被确认绕过。endpoint 变化清除许可和符合性。

Codex adapter 精确锁定 `@openai/codex@0.148.0`。API Key 通过 app-server
`account/login/start` 注入单次会话的临时 CODEX_HOME，不进入子进程环境；ChatGPT
设备码登录使用应用管理的隔离 CODEX_HOME，成功后以配置 base revision 执行 exact
CAS，失败、取消、过期或冲突会撤销 staging。登录进行中和 resident session 都会阻止
Provider、认证与数据根迁移的危险变更。无论认证方式，每条会话都启动独立常驻
app-server，使用空临时 cwd、隔离 HOME/CODEX_HOME、`ephemeral: true`、只读
filesystem、network disabled、approval never，并验证 instructionSources 为空；不
读取个人 `.codex`、AGENTS、skills、hooks、plugins、sessions 或 MCP。进程环境是
allowlist，API key 不进入 shell/MCP environment。缺少 sandbox、binary/version
不匹配或协议结果不满足这些断言时 profile fail closed。会话结束、过期或取消后
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
从不可变 session scope 派生，模型不能重复提交或覆盖范围事实。OpenAI-compatible
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

agent-config-v1 的当前内部 formatVersion 是 5。首次打开旧格式时依次应用一条原子
权威切换：format 1/2 的 chat token 估算值乘以四写为字符预算；format 1–3 补入
`reasoningEffort: model-default`；format 1–4 的内联 API Key 先写入 agent-auth-v1，再
切换配置引用。受影响的 chat profile version 增加并清除旧 conformance；Provider、
Profile ID 与浏览器默认 Profile ID 保留。迁移先完整解析并验证安全整数，再由安全
状态分区原子写回；失败时 fail closed，不能留下部分迁移。当前 API 只接受
`historyBudgetCharacters` 和非 null write-only API Key，不存在旧字段或第二条凭据清除
reader。Profile digest 同时包含 tool-contract 与 completion/conformance contract
version，因此工具 catalog 或终止分类变化都会使旧 conformance 失效。

Ollama Provider 的显式 probe 在既有 SSRF、超时、重定向和响应体限制下读取
`/api/tags`、`/api/ps`，并只为该 Provider 已配置 Profile 引用的模型调用
`/api/show`。返回的“模型架构上限”、当前“驻留实例上下文”与探测时间只驻留客户端
配置状态，不持久化、不自动填入 Profile，也不裁剪字符预算；未加载时明确表示无法
测量实际值，已加载但接口缺字段时才显示未报告。探测不发送推理请求，也不触发加载。


## 9. Presentation 与 Problems

本节只说明 Presentation 所有权与跨层边界；精确布局、交互、尺度和颜色由
[界面规范](ui-guidelines.md) 独占。

AppRoot 只创建 runtime/controller、订阅快照并维护当前 Activity。领域 session
到 view application 的组合位于 presentation/shell/application；Activity
descriptor catalog 是 ID、标签、图标、分组、可用条件与懒加载元数据的唯一
owner。顶层主入口固定为笔记、日记、代办、语法，底部管理入口固定为智能体、搜索、
仓库、设置。

每个 Activity 采用纵向切片：controller、context、view、局部 hook 和样式位于
presentation/activities/<activity>/。跨 Activity 的组合只存在于 shell，共享
交互原语只存在于 presentation/ui。笔记的 edit、structure、graph 作为 Notes
内部子切片，不再以顶层 views/controllers/bindings 技术目录分散同一功能。

Repository context、普通仓库详情、故障详情、内置数据详情和危险区是独立 view；确认状态由顶层 RepositoryPanel 持有。Todo 的集合列表、编辑器与结构详情彼此独立。引用图谱 Canvas 只声明 DOM，模拟、位置缓存、缩放和平移生命周期位于专用 hook/controller。

笔记 Activity 内部拥有 edit、structure、graph 三种原生 tab 模式，并按仓库
保存所选模式。编辑模式持续挂载，因此模式往返不替换当前笔记或 CodeMirror
历史；结构操作和引用图谱复用同一 Workspace session、selection 与导航，不再
拥有顶层 Activity 或重复的 workspace-unavailable 编排。

Journal 左侧为不可编辑的“年 → 月 → 条目”树。年、月和条目倒序；月内条目按 createdAt、sequence、ID 确定性排序。展开状态只属于页面会话。

Todo 使用“集合列表 → CTN 编辑器 → 结构详情”。集合排序复用 presentation 的共享列表拖拽几何和落点样式；详情复用共享结构树的行、缩进、选中、诊断和行号视觉，以 checkbox 执行任务状态变更，不暴露任务拖动。只有选中的任务行显示周期图标；配置表单原地展开，编辑器只显示不可交互的周期标记。

Agent 使用“会话列表 → 新会话硬范围或增量对话 → proposal 审查/审批”三栏布局。
Provider、profile、URL、model、凭据、发现、探测和符合性检查只在 Settings 的
application facade 中管理。符合性检查是服务端内存后台操作：启动请求返回 202，
客户端以短请求读取阶段或取消，不以延长通用 HTTP 超时维持单个请求；Profile timeout
只约束模型 turn。检查同时提供真实 `stage_workspace_create_note` schema 与一个干扰
读取工具，要求一次只调用正确 staging 工具；宿主只运行无内容 mutation 的假 handler。
检查流程实际要求 `describe_syntax → stage_workspace_create_note →` 自然语言总结，
随后以受限输出验证收束；因此 chat Profile 的生产 `maxToolSteps` 下限为 3。
不显示 raw
chain-of-thought。发送、批准与 destructive confirmation 前先同步范围对应的已加载
session，失败即阻止 HTTP 操作。Agent event sequence 缺口通过重读 session snapshot
恢复；message delta 直接增长现有 DOM，而不是等待 turn 完成后一次替换。
右侧默认只显示冻结的 store 名称、资源路径、动作摘要、块计数和行级 diff；删除警告
必须先于审批动作可见。协议 ID、revision、digest、change set 与字符级 diff 位于默认
关闭的技术详情中，长值显示前后各 8 位并提供复制完整值。Proposal 选择器使用序号、
状态和人类目标名称，不把 UUID 当作主标签。

Settings 的 `agentPage`、Provider/Profile 创建/编辑草稿以及搜索的折叠条件都是
Presentation 会话状态，不进入 application、contracts 或服务端配置。页内 tab、表单、
状态摘要和主区管理列表由 `presentation/ui/shared` 独占交互结构；左侧
`CompactContextList` 不作为 Settings 管理列表复用。切换 Settings 顶层分类会卸载并
清除未提交表单及 write-only secret，但不会改变服务端设备码登录状态。精确视觉与滚动
规则仍由界面规范独占。

`application/problems` 的 ProblemCenter 是运行期 operational incident 的唯一 owner。
API、Agent、同步、Settings 与 UI action 只通过 `ProblemReporter` 上报 source、code、
severity、target、message、retryable、requestId、path 与安全 details。它按
source/code/target/path/安全详情指纹聚合，requestId 只保留最近一个；记录
first/last occurred time 与 occurrence count，最多保存 200 项，刷新后清空。未知异常
映射为 `unexpected_client_error`，不暴露 stack。

领域语法、名称、引用和仓库状态仍是源状态派生 diagnostics，不进入 ProblemCenter
持久副本。Presentation shell 在每个 Activity（包括 Settings）全局合并 diagnostics、
可恢复状态故障与全部 operational incidents；筛选只改变展示，不改变所有权。问题行
可按来源、严重度和可重试性筛选，操作错误可关闭并复制最近 requestId；状态型
diagnostics 只能随源状态恢复消失。点击问题只导航到拥有恢复能力的 Activity，不执行
mutation 或盲目重试。

ProblemCenter 同时拥有五秒 transient feedback；Presentation binding 在操作开始时捕获
ActivityId，异步完成后仍使用原 target。短暂反馈结束后恢复领域非稳定持久化状态，
稳定状态不产生“已保存”文字；反馈和错误不得使用通知浮层或标题区重复投影。

编辑器只接收 editable source、语义角色和展示数据，不解释仓库元数据。canonical
页面只消费 application 已准备的 syntax、document 与 parse index；只有未保存 draft
可以在 presentation/editor 内独立分析。普通仓库没有已准备 syntax 时，编辑器使用
显式 raw 配置、Syntax Activity 使用 unavailable 状态，不构造默认领域 syntax。
普通笔记 concept、Journal body 与 Todo 必须带任务标记的规则由 core policy 决定，
不能由页面位置或 CSS 推断。

core/ctn parser 是 multiline opener、closer 与 lexical 范围的唯一 owner。领域结构事务移动块时必须消费该范围并保留完整源码；Presentation 不重建 multiline 布局，也不实现整块输入 planner。

kind = "multiline" 的块在编辑器中保持普通源码。CodeMirror 不投影卡片，不隐藏或保护围栏和正文前缀，不增加 atomic range、视觉缩进补偿、鼠标 adapter 或专用键盘命令。Presentation 只把命中规则的 tone 和 textColor 作为普通 decoration 覆盖 opener、正文和 closer；规则 label 不插入编辑文本。闭合和未闭合块使用同一可编辑路径，未闭合诊断仍来自 analysis。
