# 环境准备


## 1. 工具与启动

要求：

    Node.js >= 22.18.0
    pnpm 11.1.3
    Git 2.x

安装与 hooks：

    pnpm install
    pnpm hooks:install

启动：

    pnpm server
    pnpm dev

默认地址：

    前端 http://127.0.0.1:5173
    后端 http://127.0.0.1:3001


## 2. 配置

后端环境变量：

    CTN_API_HOST                 默认 127.0.0.1
    CTN_API_PORT                 默认 3001
    CTN_REPOSITORY_ROOT          默认 .cognition-tree/repositories
    CTN_REPOSITORY_HOST_ROOT     可选，仅用于显示宿主机路径
    CTN_SERVER_STATE_DIR         默认 .cognition-tree/server
    CTN_WEBDAV_PRIVATE_TARGETS   可选，允许的私网 origin/CIDR
    CTN_PUBLIC_URL               非 loopback 部署的 HTTPS 公开 URL
    CTN_API_TOKEN                非 loopback 部署的 bearer token
    CTN_AGENT_PROFILES_FILE      可选，严格 v1 Agent profile JSON 路径

前端启动配置：

    public/cognition-tree.config.json

    {
      "formatVersion": 1,
      "apiBaseUrl": "http://127.0.0.1:3001",
      "apiToken": "可选 owner token"
    }

页面启动时以 no-store 读取该文件。生产构建中的对应位置是
.artifacts/build/client/cognition-tree.config.json，可在启动静态站点前替换或
挂载；配置不会写入 JavaScript bundle。apiBaseUrl 只接受根路径上的绝对
HTTP(S) origin，不允许凭据、query 或 fragment。缺失或无效配置会阻止客户端
启动。前端始终连接 Node 后端，不存在本地存储模式或后端不可用时的空仓库
fallback。localStorage 只保存当前普通 repository id。

Agent 配置示例见 `docs/agent-profiles.example.json`。复制后必须替换 model、
OpenAI-compatible baseUrl，并在服务进程环境中设置各 profile 的 apiKeyEnv；UI
不能覆盖这些字段。根对象只接受以下精确字段：

    formatVersion              必须为 1
    idleTtlMilliseconds         必须为 3600000
    absoluteTtlMilliseconds     必须为 86400000
    maxAuditEntries             正整数，operation ledger 最大条数
    profiles                    profile 数组

所有 profile 都必须显式提供 id、label、kind、model、apiKeyEnv、
maxResidentSessions 和 timeoutMilliseconds。Codex 还需要 reasoningEffort、
maxInputCharacters、maxOutputCharacters；OpenAI-compatible 还需 baseUrl、
contextWindowTokens、maxOutputTokens、maxToolSteps。未知或缺失字段不会被忽略。根配置
缺失/无效时只禁用 Agent；单个 profile 无效、ID 重复或缺少 API key 时只禁用该
profile，应用不会自动 fallback。


## 3. 安全边界

默认 loopback 服务只接受 loopback Host 和本机开发 Origin，不要求 token。

绑定非 loopback 地址时，必须同时设置：

    至少 32 字符的 CTN_API_TOKEN
    HTTPS CTN_PUBLIC_URL

服务端从公开 URL 推导允许的 Host、Origin 与 CORS。启动配置中的 apiToken
会由浏览器读取并发送，因此只适用于单用户受控客户端；静态站点必须与客户端
采用相同的访问边界。

WebDAV Basic 认证只允许 HTTPS。URL 不允许 userinfo、query 或 fragment；请求不跟随重定向，不读取代理环境变量，并在每次访问前重新解析目标地址。默认只允许 global-unicast。

私网目标通过精确 origin 或 CIDR 显式授权：

    CTN_WEBDAV_PRIVATE_TARGETS='https://nas.example:5006,192.168.1.0/24 fd00::/8'

link-local、metadata、unspecified、multicast、broadcast 和 reserved 地址始终拒绝。


## 4. API 与数据目录

唯一 HTTP 契约是 `/api/v3`。同一个 registry 组合并校验 operationId、method/path、
严格 body/query schema、访问策略和 OpenAPI 3.1：

    GET  /api/v3/health
    GET  /api/v3/capabilities
    GET  /api/v3/openapi.json

    GET  /api/v3/content/events
    POST /api/v3/content/search
    GET  /api/v3/content/workspaces
    GET  /api/v3/content/workspaces/<repository-id>/tree
    GET  /api/v3/content/workspaces/<repository-id>/notes/<note-id>
    GET  /api/v3/content/journal/entries
    GET  /api/v3/content/journal/entries/<entry-id>
    GET  /api/v3/content/todo/collections
    GET  /api/v3/content/todo/collections/<collection-id>

官方客户端 owner 独占完整 snapshot sync：

    GET、PUT /api/v3/sync/workspaces/<repository-id>
    GET、PUT /api/v3/sync/journal
    GET、PUT /api/v3/sync/todo

Agent 会话同样只授权 owner：

    GET       /api/v3/agent/status
    GET、POST /api/v3/agent/sessions
    GET、DELETE /api/v3/agent/sessions/<session-id>
    POST      /api/v3/agent/sessions/<session-id>/messages
    POST      /api/v3/agent/sessions/<session-id>/cancel
    GET       /api/v3/agent/sessions/<session-id>/events?afterSequence=<n>
    POST      /api/v3/agent/sessions/<session-id>/proposals/<proposal-id>/decision
    POST      /api/v3/agent/sessions/<session-id>/proposals/<proposal-id>/destructive-confirmation

管理接口位于 `/api/v3/admin/repositories`、`/api/v3/admin/built-ins`、
`/api/v3/admin/automation-tokens` 和 `/api/v3/admin/agent-operations`，全部只授权
owner。服务端不提供路径别名、版本协商、兼容开关或公开 command operation。

认证 principal 是严格 union：loopback 无 token 请求映射为 local-owner；
`CTN_API_TOKEN` 映射为 owner；设置页创建的 automation token 只能持有
`workspace:read`、`journal:read`、`todo:read`，其中 Workspace 继续受 repository
ID allowlist 限制。automation 不能取得 snapshot sync、Agent、仓库、token、
write 或 delete 能力。Agent 的 session capability 只在服务端私有 IPC 中出现，
浏览器和公共 token 无法取得。

外部 automation 不再存在 preview、commit、commandId、resource precondition、
write 或 delete 请求。内容写入只允许 owner 官方客户端 snapshot sync，以及 owner
在 Agent Activity 中批准的 immutable proposal exact CAS。

Todo 远程客户端真值表：

    recurrence == null
        从未配置周期；按普通 completed 状态显示和写入 occurrenceDate null。
    recurrence != null 且 recurrence.active == false
        保留 completedCount/totalCount 历史，但按普通任务显示和写入
        occurrenceDate null。
    recurrence.active == true 且 currentOccurrenceDate != null
        显示活动周期和历史进度；完成当前 occurrence 时提交该精确日期。
    recurrence.active == true 且 currentOccurrenceDate == null
        不猜测日期；刷新投影后再提交。

GET `/api/v3/content/events` 使用 SSE。连接时先发送带进程级 streamId 的 revision
checkpoint，随后只发送不含正文的 change set；sequence 只在同一 stream
内比较。客户端看到新 stream 的 checkpoint 时重置去重状态并重新比较资源。
SSE 只是失效通知，资源查询和同步 snapshot 始终是真相；checkpoint 由轻量
revision tracker 提供，不扫描仓库正文。

Agent session SSE 使用另一套会话内单调 sequence。消息请求返回 202，浏览器按
sequence 增量增长 assistant message；刷新后用当前 session snapshot 和
`afterSequence` 重连。发现事件缺口或 cursor 不可恢复时重新读取 snapshot，不把
SSE 历史当作真值。

Local 普通仓库：

    <CTN_REPOSITORY_ROOT>/<repository-id>/
      .ctn/
        repository.json
        index.json
        syntax/
        note-metadata/
        transactions/
      根笔记.ctn
      目录/笔记.ctn

可见目录和 .ctn 正文是权威工作树；.ctn/ 保存稳定身份、顺序、语法、sidecar 与 WAL。文件系统只在加载、提交和手动重新扫描时读取，不运行 watcher。非 .ctn 文件属于 unmanaged 数据，不投影、不改写、不删除。

HTTP 内容根目录：

    <CTN_REPOSITORY_ROOT>/<repository-id>/
    <CTN_REPOSITORY_ROOT>/.built-ins/journal/
    <CTN_REPOSITORY_ROOT>/.built-ins/todo/

.built-ins 是保留基础设施目录，Local catalog 不会将它解释为普通仓库。

前端只在页面生命周期内为 Workspace、Journal 与 Todo 保留内存 cache、待同步
队列和冲突。刷新或关闭页面不会恢复未同步内容。旧版本的 IndexedDB 数据不
读取、不转换也不自动清理，需要时由用户在浏览器开发工具中手动删除。

WebDAV 连接配置保存在：

    <CTN_SERVER_STATE_DIR>/webdav-connections/<repository-id>.json

新服务状态分区保存在：

    <CTN_SERVER_STATE_DIR>/access-v1/automation-tokens.json
    <CTN_SERVER_STATE_DIR>/agent-v1/operations.json

automation secret 只在创建响应显示一次，磁盘只保存 SHA-256 哈希、只读 scopes、
Workspace allowlist 与使用时间。Agent ledger 以 proposal UUID + version + digest
幂等，只记录 owner、session/profile/runtime、store、before/after revision、变更
资源/块 ID、结果和时间；不记录提示词、模型回复、正文、完整 diff 或 tool
output。条目超过 maxAuditEntries 时裁剪最旧记录。

旧 `<CTN_SERVER_STATE_DIR>/api-v1/` 完全不读取、不迁移、不暴露；没有兼容 decoder。
文件原样保留供人工备份，新服务不会主动删除。既有 automation token 因而全部
失效，必须在 v3 Settings 中重新创建只读 token；旧 receipt/audit 不再显示。

内置数据目录与服务状态目录权限为 0700，含凭据或内容的文件权限为
0600。密码不进入 API 响应、日志、普通仓库内容或前端 cache。

v3 是破坏性切换：所有 `/api/v2` 请求返回 404；旧浏览器构建与新 Server 不兼容，
必须同时部署。外部 automation 的写入、删除、preview/commit 全部失效且没有外部
替代写接口。旧 command executor、DTO、operationId 和 schema 的源码导出也已删除，
依赖它们的内部或外部代码必须直接迁移，不提供 re-export。Workspace、Journal、
Todo 内容 schema 与持久布局不变，不迁移内容。

### Agent 运行与资源

Codex profile 使用精确锁定的 `@openai/codex@0.148.0` app-server，而不是默认
持久化 thread SDK 路径。每条 session 对应独立常驻子进程、空临时 cwd 和隔离
HOME/CODEX_HOME；thread 必须返回 `ephemeral: true`、无 instruction source、只读
sandbox、network disabled，否则该 profile fail closed。它不读取个人 `.codex`、
AGENTS、skills、hooks、plugins、sessions 或 MCP。参见
[Codex app-server](https://developers.openai.com/codex/app-server) 与
[Codex MCP](https://developers.openai.com/codex/mcp)。

Codex 的 session-private STDIO MCP 只暴露 scope 内 list/read/search、
stage_workspace_command、stage_journal_command、stage_todo_command 和
submit_proposal。MCP 不导入 repository/store，只携带短期 capability 连接父服务
私有 Unix socket 或 Windows named pipe。项目不提供外部 MCP listener。Codex API
key 只进入 app-server 环境，不进入 shell 或 MCP command 环境。

OpenAI-compatible profile 直接调用 `<baseUrl>/chat/completions` SSE，并复用同一
tool schema；它受 context、output、tool-step 和 timeout 限制。每个 profile 同时
只运行一个推理，其余 turn FIFO；每个 session 只允许一个 active turn。达到
maxResidentSessions 时拒绝新会话，不驱逐有效会话。Agent 对话与压缩摘要只在内存
中保存；服务重启、1 小时 idle TTL、24 小时 absolute TTL 或 session 删除会丢失。
`/cancel` 中断当前 turn、撤销 capability、停止 runtime 并将 session 置为
unavailable，之后必须新建会话；session 删除或到期也会停止 Codex 子进程，并安全
清理仅由该 session 创建的临时目录。


## 5. Repository 行为

Local 只支持删除托管数据。WebDAV 支持：

    remove-connection       删除本地连接，保留远端内容
    delete-managed-data     发布 deletion tombstone，再清理托管 generations

WebDAV 以不可变 generation、60 秒 writer lease 和 ETag CAS 提交。远端删除保留无关文件；清理未完成时 catalog 显示 deleting 并可恢复或停止跟踪。

添加 WebDAV 时会探测 ETag、条件请求、PROPFIND、MKCOL、PUT、GET 和 DELETE。空目标可以初始化为 v4；已有合法 v4 保持为远端事实；非空 unmanaged、旧版本和 tombstone 目标不会被接管。

普通 Workspace 使用 v4，Journal 使用 v3，Todo 使用 v4。它们是唯一合法格式；
只有 epoch 与内容同时不存在时才初始化。部分状态、非当前版本、损坏内容和
未来版本保持原样并投影故障，不迁移、不覆盖。


## 6. 验证

    pnpm check
    pnpm test
    pnpm test:architecture
    pnpm test:e2e
    pnpm benchmark:capacity
    pnpm build
    git diff --check

后端类型检查包含在 pnpm check 中；生产构建与启动：

    pnpm server:build
    pnpm server:start

pnpm build 先清理旧构建，再输出客户端到 .artifacts/build/client、服务端到
.artifacts/build/server。客户端目录中的 cognition-tree.config.json 是启动时
配置，可以在部署启动前替换而无需重建 JavaScript。pnpm clean 清除全部可重建
的 .artifacts，不会触碰 .cognition-tree 中的本地仓库与服务状态。

真实 WebDAV 验收：

    pnpm verify:webdav:live

该命令启动 loopback 文件系统 WebDAV，验证条件请求、双 writer fencing、断线恢复、交错读写和 lease 续租，耗时至少一分钟。


## 7. 容器与双端

未来容器路径约定：

    /data/repositories  -> CTN_REPOSITORY_ROOT（普通仓库与内置数据）
    /data/server        -> CTN_SERVER_STATE_DIR（WebDAV、access-v1、agent-v1）

Local 仓库必须整体挂载，包含根部 .ctn/。当前项目不提供 Dockerfile、镜像或 Compose。
自行容器化时还必须提供可用的进程 sandbox、可写且受边界约束的临时目录、
Codex 子进程与私有 IPC，并通过服务端 secret 注入 profile API key。此次 v3/Codex
依赖改变了进程与镜像内容，升级不能只重启旧容器：必须重新构建镜像并 recreate
容器，同时部署匹配的客户端构建。

Linux 是主要开发与后端环境。Windows 可通过浏览器访问同一后端检查界面、输入法、路径和数据互通；项目目录建议使用普通英文路径，源码与数据文件使用 LF。
