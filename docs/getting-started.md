# 使用与部署

本文件只拥有运行、配置、迁移、升级与 CLI 操作步骤。产品承诺、源码边界和界面排布
分别见[产品需求](product-requirements.md)、[架构边界](architecture.md)与
[界面规范](ui-guidelines.md)；HTTP operation 的完整事实始终来自 OpenAPI registry。

## 1. 工具与单一入口

要求 Node.js 22.18.0 或更高版本、pnpm 11.1.3 与 Git。

    ./start.sh

默认进入开发模式。生产部署先构建，再由同一个根 supervisor 启动：

    pnpm build
    ./start.sh --production

首次运行会按 lockfile 安装依赖并接入仓库已有的 Git 提交钩子。Node 是唯一监听
权威：开发模式把 Vite middleware 与 HMR WebSocket 接入同一个 HTTP Server，生产
模式由该 Server 提供 `.artifacts/build/client` 静态资源。网页和 API 始终同源，
默认地址为 `http://127.0.0.1:3001`。

`start.sh` 只管理认知树。它不启动、停止、下载或探测 Ollama，也不依赖 Docker 或
相邻仓库。只有服务设置或数据迁移产生的专用退出状态 75 会触发自动重启；其他退出
状态原样传播。按 Ctrl+C 会先关闭 Content SSE、Agent SSE 与 Vite，最多等待 5 秒，
随后才强制中断不合作连接。

## 2. 全内置设置

用户配置不使用环境变量。以下内容全部由“设置”管理：

- “设置 → 服务”：本机/局域网模式、端口、HTTPS public origin、当前数据根、数据
  迁移、宿主机显示路径、操作审计容量和 owner credential。
- “设置 → 智能体”：Provider、Profile、模型、推理参数、凭据、Ollama 发现、Provider
  探测、符合性检查和默认 Profile。
- “设置 → API 访问”：只读 automation token 与可同步全部内容的 trusted-client token。
- “设置 → 审计”：Agent 审批写入与 trusted-client 同步尝试的统一操作审计。

首次启动的服务初值是：

    dataRoot           <项目根>/.cognition-tree
    listenMode         loopback
    port               3001
    publicOrigin       null
    repositoryHostRoot null
    maxAuditEntries    1000
    owner credential   未创建

监听地址、端口、数据根和宿主机显示路径修改后受控重启生效。审计容量立即生效；缩小
时立即裁剪最旧记录。局域网模式固定绑定 `0.0.0.0`，必须先创建 owner credential，
并填写无凭据、query、fragment 的 HTTPS origin。TLS 证书仍由外部反向代理管理。

浏览器不读取独立 JSON 配置，也不保存 owner token。官方客户端只调用相对
`/api/v3`，请求携带同源 Cookie。仅 CI、E2E、测试进程变量，以及 Codex 私有 MCP
子进程的短期 capability 属于非用户运行参数；它们不会出现在设置或公开 API 中。

## 3. Owner、automation 与 trusted-client 认证

仅当请求 socket 和 Host 都是 loopback 时，服务才授予 `local-owner`。反向代理虽然
可能从 loopback socket 连接，但公共 Host 不会被提升为本机 owner。

远程使用步骤：

1. 从本机打开“设置 → 服务”，创建 owner credential。
2. 立即保存只展示一次的 owner secret。
3. 配置 HTTPS public origin 与局域网模式，等待服务重启。
4. 远程浏览器输入 secret；服务换发最长 12 小时的 `ctn_owner_session` Cookie。

Cookie 使用 `HttpOnly`、`SameSite=Strict`、`Secure`、`Path=/api/v3`。Cookie 鉴权的
写请求必须带与设置完全相同的 Origin。轮换 secret 会立即废止旧 session，并给执行
轮换的浏览器签发新 session。清除 credential 只允许在 loopback 模式中进行。

automation 继续使用 Bearer token，但只能拥有 `workspace:read`、`journal:read`、
`todo:read`；Workspace 受 repository ID allowlist 限制。任何显式但无效的 Bearer
都返回 401，绝不会退化为 local-owner。旧 owner Bearer 不再存在。

trusted-client token 也使用 Bearer，但固定拥有全部当前及未来 Workspace、Journal 与
Todo 的读取和 merge-aware snapshot sync。它不能访问 Agent、admin、auth、Provider、
系统设置或仓库创建、重命名、删除。secret 使用 `ctt_` 前缀，只在“设置 → API 访问”
创建时显示一次，撤销后立即失效并关闭该 principal 的 Content SSE。它等价于全部内容
的创建、修改和删除权，只应交给明确受信的外部 Codex 或同步程序。

## 4. 数据、控制区与迁移

固定启动控制区：

    <项目根>/.cognition-tree/bootstrap-v1/configuration.json

目录权限为 0700，文件权限为 0600。它由应用原子写入，不应手工编辑。控制区始终
固定在项目根，不参与数据迁移。损坏时服务只在 `127.0.0.1:3001` 启动恢复页面，
不加载内容、Agent 或凭据；本机可重置控制配置或重新指向一个已存在的常规目录。

当前数据根布局：

    <dataRoot>/
      repositories/
        <repository-id>/
        .built-ins/journal/
        .built-ins/todo/
      server/
        access-v1/automation-tokens.json
        access-v1/trusted-client-tokens.json
        agent-auth-v1/providers/<provider-id>/
        agent-config-v1/configuration.json
        operations-v1/operations.json

普通仓库只能位于服务端本地文件系统或容器持久卷。远程浏览器访问服务不等于远程
仓库存储。

“设置 → 服务”发起数据根迁移时，客户端先同步已加载的 Workspace、Journal、Todo。
若存在 resident Agent session、正在进行的 Codex 设备码登录、未决 proposal、其他
迁移或配置 CAS 冲突，服务拒绝启动迁移。目标必须是不存在的绝对路径，不能与源或
控制区重叠，也不能经过符号链接。

迁移只复制以下权威分区：

    repositories/
    server/access-v1/
    server/agent-auth-v1/
    server/agent-config-v1/
    server/operations-v1/

服务保留权限与时间元数据，不遍历符号链接，并比较文件数量、大小与 SHA-256。旧
`api-v1`、`agent-v1`、`agent-v2`、WebDAV 目录、旧 profile 文件和其他备份不读取、
不复制。新账本启用时会精确删除旧 `api-v1/audit.json` 和
`agent-v2/operations.json`；其他 legacy token、配置、凭据和内容原样保留。
验证成功后最后一次 CAS 更新 bootstrap 指针并重启；失败不会切换。旧数据根保持
原权限作为人工备份，不自动删除。

容器必须同时持久化项目 `.cognition-tree/bootstrap-v1` 和当前数据根。如果二者在
同一挂载卷内，持久化整个项目 `.cognition-tree` 即可；如果在不同卷中，两者都必须
独立挂载。迁移需要目标磁盘容纳完整权威数据的第二份副本。

## 5. Agent Provider 网络边界

Provider、Profile 和凭据只在“设置 → 智能体”管理。secret 以 0600 服务状态保存，
响应永不回传；这依赖操作系统文件权限，不承诺静态加密。

loopback Provider 自动允许。非 loopback 私网 origin 必须在创建或每次修改 Provider
时显式确认；许可固定到 Provider version、digest 与精确 origin。修改 endpoint 会让
许可和旧符合性结果失效。metadata、link-local、unspecified、multicast，以及 DNS
同时解析到不同安全类别的目标始终拒绝。带凭据的远程 Provider 必须使用 HTTPS。

服务当前使用 agent-config 内部 format 5。首次读取旧格式时会原子迁移：format 1/2
的 context 估算值乘以四后保存为“会话历史预算（字符）”，例如 16384 迁移为 65536、
32768 迁移为 131072；format 1–3 的 chat Profile 补入 `model-default` 推理强度；
format 1–4 的内联 API Key 先写入 `agent-auth-v1`，再切换配置引用。受影响的 chat
Profile version 增加并清除旧符合性。Provider/Profile ID 与浏览器默认 Profile ID
保留；format 1 的 Provider 不继承私网许可。非安全整数、损坏状态或任一步原子写入
失败都会 fail closed，不留下部分启用状态。该过程不读取环境变量或旧 profile 文件；
当前 API 也不接受旧字段、null secret 或兼容清除语义。

“会话历史预算（字符）”只控制 Cognition Tree 何时压缩驻留内存中的对话历史，
不会向 Ollama 发送 `num_ctx`，也不表示模型的真实 token 上限。需要观察模型事实时，
点击对应 Provider 的“探测”：Ollama 会为该 Provider 已配置 Profile 所引用的模型显示
“模型架构上限”“当前驻留上下文”和探测时间；模型未加载时明确显示无法测量实际值，
已加载但接口缺字段时显示未报告。探测不发送推理请求、不加载模型、不延长驻留，结果
也不持久化、不自动填写或裁剪 Profile。

符合性检查会显示“等待工具调用”“等待自然语言总结”和“记录结果”阶段，并可在记录
结果前取消。大型本地模型可能需要数分钟；浏览器通过状态轮询观察检查，不受普通 API
请求的 30 秒上限截断，模型本身仍受该 Profile 的 timeout 限制。检查使用真实的
Workspace 新建笔记 schema，并同时提供一个干扰读取工具；假 handler 不会创建内容、
staging 或 proposal。当前检查依次验证读取检查专用的写作指南、正确单工具调用和
后续自然语言总结；因此 chat Profile 的“最大工具步骤”不能小于 3。

本版本的 Agent tool contract 已升级。现有 chat Profile 会因旧符合性 digest 失效而
暂时 unavailable；升级并重启 Cognition Tree 后，在“设置 → 智能体”重新执行一次
符合性检查即可继续创建新会话。检查不会写入仓库内容。

Ollama 发现只在用户点击后执行，默认地址是 `http://127.0.0.1:11434`。认知树只调用
模型层 `/api/tags`、显式探测所需的 `/api/ps` 与 `/api/show`，以及推理所需的
`/v1/chat/completions`；不调用另一个代码 Agent 的任务、MCP、Git 或 shell API，
也不接管 Ollama 生命周期。

Ollama chat Profile 的推理强度可选“模型默认、关闭、低、中、高”。“模型默认”不发送覆盖
参数，其余值映射到 Ollama 请求的 `reasoning_effort`；运行时不会
按模型名称自动修改或 fallback。模型的原始 reasoning 只为当前工具循环保留在内存，
不会显示、持久化或进入审计。输出因长度耗尽、过滤、缺少终止帧或空回复结束时，会
产生 Agent Problem，不会被当作成功，也不会隐藏重试。

### Codex 认证

先创建 `kind: codex` 的 Provider，并只选择一种认证方式：

- API Key：在设置中一次性写入。新会话通过 app-server 登录协议注入临时认证，不把
  key 放入 shell、MCP 或子进程环境。
- ChatGPT 设备码：创建 Provider 后点击“使用 ChatGPT 登录”，打开设置显示的 HTTPS
  地址并输入设备码。登录可取消，15 分钟后自动过期；成功后只显示“认证已配置”。

“退出认证”是唯一清除入口。存在 resident session 或正在登录时，切换 Provider、退出
认证、删除 Provider 和数据根迁移都会被拒绝。ChatGPT 登录态保存在应用管理的
`agent-auth-v1`，不读取个人 `~/.codex`。每个 Cognition Tree 会话仍创建独立 app-server
进程和 `ephemeral` thread，不导入或继续 Codex Desktop/CLI 历史。

## 6. API v3

无需已有 owner session 的操作：

    GET /api/v3/health
    GET /api/v3/capabilities
    GET /api/v3/openapi.json
    GET、POST /api/v3/auth/session

owner-only 服务管理操作：

    DELETE /api/v3/auth/session
    GET、PATCH /api/v3/admin/system-configuration
    POST、DELETE /api/v3/admin/system-configuration/owner-credential
    POST /api/v3/admin/data-root-migrations
    GET  /api/v3/admin/data-root-migrations/<migration-id>
    GET、POST /api/v3/admin/trusted-client-tokens
    DELETE /api/v3/admin/trusted-client-tokens/<token-id>
    GET /api/v3/admin/operations/status
    GET /api/v3/admin/operations

内容只读、snapshot sync、Agent 会话、Provider/Profile 管理、仓库管理、两类外部
token 与操作审计均属于唯一 `/api/v3` registry。浏览器与 trusted-client 使用同一
snapshot sync 并接收服务端最终 snapshot；Agent proposal 不使用此合并路径。不存在
`/api/v2`、公开 command API、
preview/commit、写入 automation scope 或兼容 parser。

错误响应是带 `code`、`message`、`requestId`、服务端 `retryable` 与严格 `details` 的
判别联合。客户端不得仅凭 HTTP status 猜测能否重试。尤其
`operation_audit_finalize_failed` 表示正文已提交，只能根据 `afterRevision` 重新 GET
对账，不能重放 PUT。

完整 method、path、schema 和访问策略从 `GET /api/v3/openapi.json` 读取；本节只列出
服务配置与登录所需的主要入口，不维护第二份 operation catalog。

## 7. 外部可信客户端 CLI

根入口 `./ctn` 只调用 `/api/v3`，不会读取 bootstrap、浏览器存储或直接修改仓库目录。
先在“设置 → API 访问”创建 trusted-client secret，再从 TTY 添加 profile：

    ./ctn auth add --profile daily --server https://tree.example.com
    ./ctn auth list
    ./ctn auth use --profile daily
    ./ctn auth remove --profile daily

第一个 profile 自动成为 default；删除 default 后保持未选择，不会自动切换到其他
profile。其他命令可以传 `--profile <name>`。Server origin 默认必须为 HTTPS，只有
`127.0.0.1`、`localhost` 与 `[::1]` 可使用 HTTP；禁止凭据、非根 path、query 与
fragment。HTTP client 拒绝重定向，避免 Bearer 泄露。

凭据位于：

    ~/.config/cognition-tree/cli-v1/credentials.json

CLI 以 0700 目录、0600 文件、no-follow 打开与原子 fsync 替换保护该文件，拒绝
符号链接。secret 不接受环境变量或命令行参数，只能从 TTY 输入。

通用调用：

    ./ctn openapi
    ./ctn request GET /api/v3/capabilities
    ./ctn request GET /api/v3/content/workspaces

`request` 的完整形态是 `./ctn request <method> <path> [--body <file>]`；body 文件必须是
JSON，实际路径与 schema 从 `openapi` 输出读取。

同步 checkout 保存 `{ base, content }`。外部程序只修改 `content`，提交成功后 CLI
用服务端最终 snapshot 原子更新同一文件：

    ./ctn sync checkout workspace --repository <repository-id> --output workspace.json
    ./ctn sync commit workspace --repository <repository-id> --file workspace.json
    ./ctn sync checkout journal --output journal.json
    ./ctn sync commit journal --file journal.json
    ./ctn sync checkout todo --output todo.json
    ./ctn sync commit todo --file todo.json

若服务返回 `operation_audit_finalize_failed`，CLI 不重放 PUT，而是 GET 权威 snapshot；
revision 等于 `afterRevision` 时才更新 checkout，并仍返回退出码 6。退出码含义：

    0 成功
    1 CLI 内部错误
    2 输入或凭据错误
    3 认证或授权失败
    4 校验或 merge conflict
    5 可重试网络或服务故障
    6 内容可能或已经提交，需要对账

## 8. 构建与验证

    pnpm check
    pnpm test
    pnpm test:architecture
    pnpm build
    pnpm test:e2e
    git diff --check

生产构建输出：

    .artifacts/build/client
    .artifacts/build/server

运行 `pnpm server:start` 时，Node 从同一 origin 提供 API 与客户端静态资源。不存在
可替换的客户端启动配置文件。`pnpm clean` 只清除 `.artifacts`，不会触碰
`.cognition-tree`。
