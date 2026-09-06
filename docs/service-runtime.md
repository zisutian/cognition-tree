# 服务运行

本文件拥有 HTTP、认证、持久分区、账本、迁移事务与模型进程的运行边界。
源码依赖见[模块边界](architecture.md)，内容合并见[内容一致性](content-consistency.md)，
实际部署与恢复步骤见[部署与恢复](deployment.md)。

## 存储、协议与认证

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

唯一 HTTP 契约为 `/api/v4`。contracts/api 的唯一 registry composition root
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
`/api/v4/content/*` 的已授权只读资源、搜索与无正文 change event；trusted-client
拥有全部内容读取与三个 sync operation，但不能取得 Agent、仓库管理、Provider、
系统设置或 owner-session 能力。
change event 的 resource 逐项鉴权；block 只在其 resourceId 的全部同名资源均可见时
投影，跨域或跨仓同名且可见性混合时必须丢弃，不能凭 ID 集合扩大授权。

SSE 只发送带
`streamId` 的 checkpoint 与无正文 change set；sequence 只在同一 stream
内部有序，进程重启产生的新 stream 会使客户端重置去重状态。轻量 revision
tracker 维护 checkpoint，建立连接不会扫描仓库正文。

`/api/v4/agent/sessions/{sessionId}/events` 是另一条会话专属 SSE：message delta、
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
token 的 `lastUsedAt` 由 access session 串行观察并按分钟节流持久化；持久值、会话值
与当前时钟取时间最大值，系统时钟回拨或外部刷新不得让审计时间倒退。

operations-v1 在一个原子状态中分离 `auditEntries` 与 `agentReceipts`。受审计 mutation
先以短事务持久化认证尝试，body 解码后再附加 store、base revision 与 intent digest；
释放账本锁后才执行内容 CAS，发布真实 change event，最后以短事务写终态。任一写前
步骤失败都不得越过对应 CAS 边界；CAS 已成功但 finalize 失败则内容不回滚，pending
记录保留并返回明确对账错误。不同内容 operation 的 CAS 可并发，账本锁只保护短暂
状态替换。

Agent receipt 唯一键仍为 proposal UUID + version，并校验 digest；同进程 pending
请求复用 promise，已完成同 digest 返回原 receipt，不同 digest 冲突，重启后孤立
pending 标记为 indeterminate 且禁止重放。receipt 在 24 小时会话生命周期后清理，
不受审计展示容量直接裁剪；auditEntries 才按“设置 → 审计 → 保留策略”的操作审计保留条数裁剪。
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

数据根迁移状态机由 application/system 独占，客户端通过 application/workbench
排空已加载内容。基础设施分别实现 bootstrap、持久记录和文件事务端口，接线位于
server 根。固定控制区的迁移记录在不可逆步骤前持久化 ID、源与目标、前后 revision、
目录身份、校验摘要和阶段；阶段与提交结果（未提交、已提交、不确定）分别保存。

维护先关闭新内容请求和会话入口，排空已接纳请求，再检查 resident Agent、设备登录
和实际仍运行的后台操作。读请求也可能写入认证使用时间或惰性初始化数据，因此参与
排空。application/runtime 的写入租约由 server/platform 的异步上下文适配；请求内派生
写入持有独立租约，父请求结束不能提前释放子任务。Agent 内容 CAS 与审计收尾、
Provider 凭据安装与配置提交、符合性结果记录共享同一写入范围。结束请求中尚未开始的
延迟任务不能借用旧租约。仍驻留的模型或设备登录进程会阻止复制。

文件事务通过排他创建取得目标所有权，拒绝已占用路径、符号链接和路径重叠；文件句柄
读取核对稳定身份，复制保留 mode、atime、mtime，并校验目录、大小与 SHA-256 后 fsync。
只复制[部署文档](deployment.md#数据控制区与迁移)列出的权威分区；
仓库根的运行时 writer lock 不属于业务数据。失败保留已分配目标，源始终保留，自动清理
仅针对本次拥有的临时文件。

指针提交结果不确定时保持维护，在 bootstrap 锁内重读并确认持久性。证明仍是原 revision
才恢复源服务；证明是目标 revision 且目标完整才继续重启；无法证明则保持维护并提供
诊断及重新对账。启动在初始化内容服务之前先恢复未结束迁移。已完成记录不再用旧摘要
约束正常编辑。迁移恢复不调用重置 bootstrap 的函数；权限、磁盘或锁问题处理后可重新
对账，不提供绕过校验的强制入口。专用退出状态 75 交由 supervisor 重启。

## 服务端适配与生命周期

    server/persistence 统一 durable replace、目录 fsync、临时文件清理和安全文件检查。
    repository/workspace/local 分为 layout、codec、canonical projection、物理扫描与身份匹配、managed-data guard，以及 WAL state、planner、manifest、executor、recovery 和 commit coordinator。state 只捕获/比较工作树并检查待删目录；executor 只应用与回滚已验证 payload；recovery 只解释启动时 WAL；workingTreeTransaction 只组织 staging、阶段回调和 repository.json 提交点。localRepositoryRootLease 独占 canonical root、writer lock、丢失检测与启动时 staging/tombstone 清理；localRepositoryInventory 独占目录枚举、metadata/identity 校验、问题分类与 label issue 投影；LocalRepositoryCatalog 独占稳定 ID 分配、名称约束与 store 组合。catalog dispose 在调用时关闭新操作入口，排空已接纳操作后释放 store 与 root lease；catalog 和 root lease 都是不可重启终态。
    localRepositoryDeletion 独占普通仓库删除的 managed-data 校验、durable tombstone
    rename 提交点、失败回滚与可恢复物理 cleanup；catalog 只先排空驻留 store 并委托。
    server/network 的 jsonRequestBody 独占入站 JSON 的 media type、Content-Length、
    流式字节上限、aborted 终态、fatal UTF-8 与 JSON framing；api/http 与 system
    recoveryRequest 只把通用传输失败映射到各自公开错误。API server 的 api/http
    拥有 request lifecycle、认证、operation-specific 限制和 registry 分派；非法字节
    不得以替换字符进入 wire schema、内容摘要或恢复配置，handler 不得将客户端断连
    伪装成 API 500；
    error mapping 与响应 envelope 仍是 handler 的权威事实，日志仅为经脱敏的
    非权威观测，logger 失败不得替换或拒绝既定 API 响应；
    server/transport 独占 SSE socket 的失败与 backpressure 隔离，单个慢连接直接断开
    并依赖 checkpoint/replay 重同步，不得反向改变提交、Agent turn 或其他订阅者；
    serverLifecycle 将关闭拆成停止接收、结束两类长连接、等待活动请求或限时强制断连、
    最后释放请求依赖资源四个有序阶段；多项关闭失败必须全部保留，不能让资源清理与
    尚未结束的 handler 并发；
    server/state 独占安全状态目录的类型、权限与创建持久性；首次递归创建必须从目标
    向上逐级 fsync 至原有祖先，不能只同步最终状态文件所在目录；每个安全 JSON 文件
    通过独立跨实例锁串行，持锁后刷新磁盘 authority 再执行 read/mutate，解锁失败后
    分区 fail closed；
    api/resources、api/sync 分别拥有只读 wire 资源投影与同步协议适配；application/sync
    执行普通同步用例。application/search 通过查询端口协调各来源，HTTP 仅转换协议。server/access 独占 automation 与 trusted-client token；
    server/operations 独占统一账本、审计状态和 Agent receipt；其中
    application/operations 的 operationLedgerPort 独占公开错误与命令类型；operationLedgerState 独占
    operations-v1 严格解析与初始状态，operationLedgerProjection 独占 Agent/trusted
    审计 wire 投影与稳定 operation key，operationLedgerStore 独占安全分区、串行化、
    可用性、容量与旧文件清理，trustedClientOperationLedger 独占 trusted-client 的
    begin/attach/finalize 事务，agentOperationLedger 独占 in-flight 去重、持久 receipt、
    retention 与 terminal/indeterminate 流程，operationLedger 只作为显式组合根和公开
    façade；
    server/agent 拥有模型 runtime adapter、Provider 配置和凭据存储、私有 IPC 与子进程
    协议；内存会话和 Provider 操作状态由 application/agentHost 拥有。
    application/agentHost/providerOperations 组合探测、设备码登录与 conformance 用例，
    拒绝关闭后的新操作；各用例拥有自身记录、预留、执行任务和幂等释放，通过端口访问
    配置、时钟和进程。server/runtime 负责三领域工具及平台端口的构造与接线；
    configurationErrors、configurationInput 与 configurationViews 分别独占配置错误、
    stored input 归一化和 digest/read-model 投影，configurationStore 只组合事务、
    credential/access 生命周期与这些纯策略；configurationRevision 独占 revision CAS
    断言，profileConfiguration 通过显式 mutation port 独占 Profile CRUD 与 conformance；
    providerConfiguration 通过显式 read/mutation ports 独占 Provider CRUD、认证候选、
    device-code staging/activation、change lease 与 conformance 失效；credentialManifest
    独占凭据格式、引用路径、identity 解析、digest 与有界编解码，codexManagedHomeStore
    独占托管 HOME 的 prepare、递归 seal、active 校验和安全删除，providerCredentialStore
    只编排凭据分区、manifest 生命周期与配置引用 reconciliation；
    jsonLineTransport 独占 Codex app-server、STDIO MCP 与 private IPC 共用的有界
    JSONL framing，拒绝超长行、非法 UTF-8 和 EOF 残行；privateIpc 独占 capability
    与本地监听器，并线性化并发启动和幂等关闭，client 只接受一个匹配 correlation 的
    完整响应终态；
    application/agentHost 的 Agent service 关闭门统一阻止新 session 与 owner mutation，并协调 owner 操作、
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
    application/agentHost 的 sessionEventStream 独占事件 sequence、重放窗口和终态关闭；
    HTTP 层把中立事件 sink 适配到 SSE，应用层不持有 socket。
    基础设施 sessionToolProtocol 解码模型工具请求，proposalCodec 只计算摘要；
    application/agentHost 的 sessionToolState 和三领域 sessionTools 拥有暂存、scope 与 review；
    公共工具协调器通过端口调用它们，三者在 server/runtime 中显式构造与接线；AgentRuntimeProtocolError 由 application runtime
    port 独占，基础设施 adapter 只消费这个中立失败语义。application/agentHost/providerProbe
    协调配置与结果时间；基础设施 providerProbeTransport 独占带
    SSRF policy、超时、禁止重定向、1 MiB 严格 JSON 响应的模型元数据探测；
    openAiChatProtocol 独占要求 text/event-stream、fatal UTF-8、有界 frame 的
    OpenAI-compatible SSE，以及 tool envelope 与 correction 的纯协议规则，
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
`historyBudgetCharacters` 是服务端内存会话历史和单次在途 completion/tool delta
累计状态的字符硬上限，不是模型 token 上限，也不会设置 Ollama `num_ctx`。凭据只写入
不回读；Provider 只激活 `none`、API Key 或
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

Codex adapter 精确锁定 `@openai/codex@0.148.0`；codexPackage 独占固定版本、入口布局
及最多 1 MiB、`O_NOFOLLOW`、fatal UTF-8 的 package metadata 解析，JSON-RPC client
只拥有协议与连接生命周期。API Key 通过 app-server
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
撤销 capability；interrupt 使用有界等待，随后按 SIGTERM、SIGKILL 两阶段终止并确认
exit，最后才清理服务为该 session 建立的临时目录。session dispose 是幂等终态，子进程
退出会拒绝全部 pending 和后续 JSON-RPC 请求。

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
当前格式和逐版本升级步骤由[部署与恢复](deployment.md)记录。

Ollama Provider 的显式 probe 复用 SSRF、超时、重定向和响应体限制，只查询发现、
驻留与模型元数据。结果只驻留客户端配置状态，不修改 Profile、不发送推理请求、
不触发模型加载；具体操作与显示字段由设置操作和界面规范分别拥有。
