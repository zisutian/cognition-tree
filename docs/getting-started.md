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

唯一 HTTP 契约是 /api/v2。入口由同一 registry 生成路由、严格 body
解析、权限声明和 OpenAPI 3.1：

    GET  /api/v2/health
    GET  /api/v2/capabilities
    GET  /api/v2/openapi.json
    GET  /api/v2/events
    POST /api/v2/search

    GET  /api/v2/workspaces
    GET  /api/v2/workspaces/<repository-id>/tree
    GET  /api/v2/workspaces/<repository-id>/notes/<note-id>
    POST /api/v2/workspaces/<repository-id>/commands

    GET  /api/v2/journal/entries
    GET  /api/v2/journal/entries/<entry-id>
    POST /api/v2/journal/commands
    GET  /api/v2/todo/collections
    GET  /api/v2/todo/collections/<collection-id>
    POST /api/v2/todo/commands

官方客户端独占完整同步：

    GET、PUT /api/v2/sync/workspaces/<repository-id>
    GET、PUT /api/v2/sync/journal
    GET、PUT /api/v2/sync/todo

管理接口位于 /api/v2/admin/repositories、/api/v2/admin/tokens 和
/api/v2/admin/audit。服务端只解析 registry 声明的当前 operation，不提供
别名、版本协商或兼容开关。

自动化应使用设置页创建的高熵令牌，并调用资源查询和领域命令。令牌只能获得
Workspace、Journal、Todo 的 read、write、delete scope；repository allowlist
仅约束 Workspace。自动化令牌不能取得 sync、syntax:write、
repository:admin 或 token:manage。delete 不包含在 write 中，删除命令还必须
携带目标资源版本；命令中的显式 delete kind 表达业务语义，delete scope
负责授权，UI 确认只属于交互层。wire command 不接受 `confirm`。

每个命令使用严格 envelope：`command` 只表达业务意图，`preconditions` 按
command kind 精确声明全部目标 SHA-256 资源版本。preview envelope 只包含
`mode: "preview"`、`command` 和 `preconditions`，不接受 commandId、不写入、
不审计也不产生幂等回执；commit envelope 额外必须包含 UUID commandId，并在
一个 versioned store 内原子提交。旧的扁平命令请求不解析。
相同 principal、commandId 和请求体在 30 天内返回原回执；相同 commandId 的
不同请求返回 409 idempotency_conflict。同资源版本变化返回
409 resource_conflict，不覆盖内容。

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

GET /api/v2/events 使用 SSE。连接时先发送带进程级 streamId 的 revision
checkpoint，随后只发送不含正文的 change set；sequence 只在同一 stream
内比较。客户端看到新 stream 的 checkpoint 时重置去重状态并重新比较资源。
SSE 只是失效通知，资源查询和同步 snapshot 始终是真相；checkpoint 由轻量
revision tracker 提供，不扫描仓库正文。

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

API 状态分区保存在：

    <CTN_SERVER_STATE_DIR>/api-v1/tokens.json
    <CTN_SERVER_STATE_DIR>/api-v1/receipts.json
    <CTN_SERVER_STATE_DIR>/api-v1/audit.json

`api-v1` 在这里仅是已经发布的磁盘目录名，不是 HTTP namespace。v2 继续原位
读取这些文件，避免迁移或遗失既有 token、audit 和 receipt；旧请求产生的
commandId 被 v2 envelope 复用时，因为请求摘要不同而返回
`409 idempotency_conflict`。

三个文件分别只保存令牌 SHA-256 哈希与授权、无正文幂等回执和分页审计。
创建响应中的 secret 不落盘；单个分区损坏不会阻断其它分区，token
lastUsedAt 最多每分钟落盘一次。服务端不读取或转换其它状态格式。

内置数据目录与服务状态目录权限为 0700，含凭据或内容的文件权限为
0600。密码不进入 API 响应、日志、普通仓库内容或前端 cache。


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
    /data/server        -> CTN_SERVER_STATE_DIR（WebDAV 连接状态）

Local 仓库必须整体挂载，包含根部 .ctn/。当前项目不提供 Dockerfile、镜像或 Compose。

Linux 是主要开发与后端环境。Windows 可通过浏览器访问同一后端检查界面、输入法、路径和数据互通；项目目录建议使用普通英文路径，源码与数据文件使用 LF。
