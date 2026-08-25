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

API principal 是严格 union，不共享“全部 scopes”：

    local-owner、owner：按 operation 的 owner policy 授权，不构造 scopes。
    automation：只能持有 workspace:read、journal:read、todo:read；Workspace
    继续受 repository ID allowlist 限制。
    agent-session capability：只存在于服务端私有 IPC，不属于 HTTP principal。

local-owner 同时要求 socket remote address 与 Host 都是 loopback；公共 Host 经过
loopback 反向代理不会提升权限。远程 owner 只来自签名 HttpOnly session Cookie，
credential version 轮换立即使旧 Cookie 失效，Cookie 写请求还必须精确匹配设置中的
HTTPS Origin。Bearer 只属于只读 automation，显式无效 Bearer 一律 401。

每个 operation 只声明 public、owner 或 owner-or-automation-read(domain)。完整
Workspace/Journal/Todo snapshot sync、Agent 会话/审批、repository、token 和 audit
管理只属于 owner。automation 只能调用 `/api/v3/content/*` 的只读资源、搜索与
无正文 change event，不能取得 sync、write、delete、Agent 或管理能力。

内容写入只有两个入口：owner 官方客户端 sync 与已批准 Agent proposal 的 exact
CAS。领域 transition、preparation 和 change projection 仍是内容语义的唯一 owner；
HTTP handler、runtime、MCP、SSE、audit 和 presentation 不重建领域命令或变化。
官方 sync 和 Agent commit 都只生成一次 DomainChangeSet，供事件和失效刷新消费。

资源版本是内容 SHA-256；canonical block metadata 是 block createdAt/updatedAt
的唯一来源。Todo 正文、位置、completion 与 recurrence 语义变化都更新目标
block updatedAt，但并发判断不使用时间戳。

官方客户端在内存中保存当前页面会话的 clean base 和 conflict
base/local/remote。Workspace 以语法、树和单篇 note 为单元，Journal 以 entry
为单元，Todo 以 collection body、collection order、单任务 completion 和
recurrence 为单元执行三方合并。不同单元自动 rebase；同一单元双改、删改竞争
进入冲突。刷新不会恢复尚未同步的 base 或 conflict。语法变化是 barrier，
不能跨 grammar 自动合并。SSE 只发送带
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
    <dataRoot>/server/agent-config-v1/configuration.json
    <dataRoot>/server/agent-v2/operations.json

access 分区只保存 automation token 的 SHA-256 哈希、只读授权与 Workspace allowlist；
agent-config 分区独占 provider、profile、凭据、version、digest 与符合性结果；agent-v2
用 proposal UUID + version + digest 做幂等键，并保存 approving owner、
session/profile/provider/runtime、store、before/after revision、变更资源/块 ID、结果与时间。
operation ledger 不保存提示词、模型回复、正文、完整 diff 或 tool output，超过
“设置 → 服务”的 maxAuditEntries 后立即裁剪最旧记录。bootstrap 固定在项目根，
独占监听、端口、数据根指针、public origin、宿主机显示路径、审计容量和 owner
credential 摘要；配置使用 exact CAS，损坏时只启动本机 recovery registry。

旧 `<dataRoot>/server/api-v1/` 和 `agent-v1/` 完全不读取、不迁移、不暴露，也不存在兼容
decoder；文件原样保留供人工备份，新服务不会主动删除。状态目录权限为 0700、
文件权限为 0600；一个新分区损坏只使该能力 fail closed，不阻断内容领域。

数据根迁移由 application/workbench 的 loaded-content flush、application/system 的
迁移用例和 infrastructure/system 的文件协调器共同完成。maintenance gate 阻止新
mutation 并等待已有请求结束；协调器只复制 repositories、access-v1、agent-config-v1
和 agent-v2，拒绝符号链接与路径重叠，逐文件校验数量、大小和 SHA-256，最后才 CAS
更新 bootstrap 指针。失败不切换指针；成功通过专用退出状态由根 supervisor 重启。
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
digest、base revision、change set、最终 diff 与 destructive 标记的只读值，只能
整批批准或拒绝。任意 store revision 变化使其 stale；删除批准后必须再经过独立
destructive confirmation。

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
    api/resources、api/sync 分别拥有只读资源投影与 owner snapshot 同步，search
    保持独立查询入口。server/access 只拥有 automation token；server/agent 拥有
    store 组合、runtime adapter、私有 IPC、内存会话和 operation ledger，不重写
    领域 command。
    repository/built-ins、repository/versioned、repository/workspace 分别拥有
    系统内容、通用版本存储和 Workspace 持久布局。只有 contracts/api registry
    定义 HTTP wire，只有 owner sync 与 Agent exact commit 可以写内容。

这些模块只拆职责，不改变本地 WAL 提交点或仓库内容 schema。普通仓库没有第二种
存储实现、组合 catalog、连接 registry 或存储回退路径。

Agent 配置由 application/agent 端口协调、设置界面操作并写入独立的 versioned 服务端状态；固定 1 小时 idle TTL、
24 小时 absolute TTL，审计容量来自 bootstrap 服务设置。每个 profile 显式声明
maxResidentSessions、model、timeout 与 tool/request limit；凭据只写入不回读。
aggregate、provider 和 profile 均有 version/digest，管理 mutation 使用 exact CAS。
会话固定创建时的有效配置；普通 profile 修改不影响旧会话，resident session 会阻止
provider、凭据和 profile 删除。单个 profile 无效或缺少 secret 时只禁用该 profile，
不回退到其它 profile。每个 profile 同时只运行一个推理，turn FIFO；每个 session 同时
只有一个 active turn，达到 resident 上限时拒绝新会话而不驱逐有效会话。

Provider 私网许可不是全局 policy：loopback 自动允许，其他私网 origin 必须在每次
Provider 创建或修改时显式确认，并进入该 Provider version/digest。推理、probe 和
conformance 每次请求前重新解析目标；metadata、link-local、unspecified、multicast
与混合 DNS 结果不可被确认绕过。endpoint 变化清除许可和符合性。

Codex adapter 精确锁定 `@openai/codex@0.148.0`，每条会话启动独立常驻
app-server。它使用空临时 cwd、隔离 HOME/CODEX_HOME、`ephemeral: true`、只读
filesystem、network disabled、approval never，并验证 instructionSources 为空；不
读取个人 `.codex`、AGENTS、skills、hooks、plugins、sessions 或 MCP。进程环境是
allowlist，API key 不进入 shell/MCP environment。缺少 sandbox、binary/version
不匹配或协议结果不满足这些断言时 profile fail closed。会话结束、过期或取消后
撤销 capability、停止进程，并只清理服务为该 session 建立的临时目录。

Codex 的会话专属 STDIO MCP 只定义 scope 内 list/read/search、三个
stage_*_command 和 submit_proposal。MCP 进程不导入 repository/store，只通过
Unix domain socket 或 Windows named pipe 连接父服务私有 IPC，并携带单会话短期
capability。list 不接收参数，read 只接收 resourceId；领域、仓库和细粒度范围始终
从不可变 session scope 派生，模型不能重复提交或覆盖范围事实。OpenAI-compatible
adapter 直接消费同一 contracts/agent tool schema，
使用 `/chat/completions` SSE。Ollama adapter 直接连接模型服务的 `/v1/chat/completions`，
不调用本地代码 Agent 的 task API、MCP、Git、shell、ChangeSet 或审批层。native 与
Ollama-only single-json 都由 runtime 分类，presentation 只消费最终字符串；工具信封
与工具结果不生成聊天 delta。runtime 受串行 tool call、context/output/tool-step
limit 与 timeout 约束，不建立公开 MCP。项目不监听外部 MCP endpoint。


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

Agent 使用“会话列表 → 新会话硬范围或增量对话 → proposal diff/审批”三栏布局。
Provider、profile、URL、model、凭据、发现、探测和符合性检查只在 Settings 的
application facade 中管理；不显示 raw
chain-of-thought。发送、批准与 destructive confirmation 前先同步范围对应的已加载
session，失败即阻止 HTTP 操作。Agent event sequence 缺口通过重读 session snapshot
恢复；message delta 直接增长现有 DOM，而不是等待 turn 完成后一次替换。

Problems 所有权：

    普通活动 -> Workspace diagnostics、普通仓库运行故障、来源 Activity 操作错误
    Repository -> Workspace、普通仓库、内置数据、名称、运行故障、来源 Activity 操作错误
    Journal -> Journal 文档、语法、仓内与跨仓引用、Journal 运行故障、来源 Activity 操作错误
    Todo -> Todo 语法与 CTN、Todo 运行故障、来源 Activity 操作错误
    Syntax -> 当前 owner profile，并附加该 owner 内容诊断、运行故障和来源 Activity 操作错误
    Agent -> profile、runtime、IPC、队列、event stream 和 commit 故障，可定位会话
    Settings -> 不挂载

application/workbench 的 WorkbenchFeedbackController 提供 subscribe、getSnapshot、reportInfo、reportError、dismiss，以及作用域清理和生命周期释放，不依赖 React。Presentation binding 在操作开始时捕获 ActivityId；异步完成后仍写回原 Activity。相同 Activity 与消息的错误合并，每个 Activity 最多保留 20 条，页面刷新后清空。

Presentation shell 统一合并 diagnostics、可恢复运行故障和操作错误。状态故障随 session 恢复自动消失；操作错误只在关闭、普通仓库作用域失效或刷新时消失。短暂反馈覆盖五秒后恢复领域非稳定持久化状态，稳定状态不产生文字；反馈和错误不得使用通知浮层或标题区重复投影。

编辑器只接收 editable source、语义角色和展示数据，不解释仓库元数据。canonical
页面只消费 application 已准备的 syntax、document 与 parse index；只有未保存 draft
可以在 presentation/editor 内独立分析。普通仓库没有已准备 syntax 时，编辑器使用
显式 raw 配置、Syntax Activity 使用 unavailable 状态，不构造默认领域 syntax。
普通笔记 concept、Journal body 与 Todo 必须带任务标记的规则由 core policy 决定，
不能由页面位置或 CSS 推断。

core/ctn parser 是 multiline opener、closer 与 lexical 范围的唯一 owner。领域结构事务移动块时必须消费该范围并保留完整源码；Presentation 不重建 multiline 布局，也不实现整块输入 planner。

kind = "multiline" 的块在编辑器中保持普通源码。CodeMirror 不投影卡片，不隐藏或保护围栏和正文前缀，不增加 atomic range、视觉缩进补偿、鼠标 adapter 或专用键盘命令。Presentation 只把命中规则的 tone 和 textColor 作为普通 decoration 覆盖 opener、正文和 closer；规则 label 不插入编辑文本。闭合和未闭合块使用同一可编辑路径，未闭合诊断仍来自 analysis。
