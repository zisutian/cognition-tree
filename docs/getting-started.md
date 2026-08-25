# 使用与部署

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
  迁移、宿主机显示路径、Agent operation audit 容量和 owner credential。
- “设置 → 智能体”：Provider、Profile、模型、推理参数、凭据、Ollama 发现、Provider
  探测、符合性检查和默认 Profile。
- “设置 → API 访问”：只读 automation token 与 Agent operation audit。

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

## 3. Owner 与 automation 认证

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
        agent-config-v1/configuration.json
        agent-v2/operations.json

普通仓库只能位于服务端本地文件系统或容器持久卷。远程浏览器访问服务不等于远程
仓库存储。

“设置 → 服务”发起数据根迁移时，客户端先同步已加载的 Workspace、Journal、Todo。
若存在 resident Agent session、未决 proposal、其他迁移或配置 CAS 冲突，服务拒绝
启动迁移。目标必须是不存在的绝对路径，不能与源或控制区重叠，也不能经过符号链接。

迁移只复制以下权威分区：

    repositories/
    server/access-v1/
    server/agent-config-v1/
    server/agent-v2/

服务保留权限与时间元数据，不遍历符号链接，并比较文件数量、大小与 SHA-256。旧
`api-v1`、`agent-v1`、WebDAV 目录、旧 profile 文件和其他备份不读取、不复制。
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

服务首次读取旧的无私网许可 Agent 配置格式时，会把内部状态原子升级为当前格式；
Provider/Profile 与凭据继续保留，但所有旧 Provider 都从“没有私网许可”开始，私网
地址必须在设置中重新确认。Provider digest 的变化也会使旧符合性摘要失效，chat
Profile 需要重新执行符合性检查。该过程不读取环境变量或旧 profile 文件。

Ollama 发现只在用户点击后执行，默认地址是 `http://127.0.0.1:11434`。认知树只调用
模型层 `/api/tags` 与 `/v1/chat/completions`，不调用另一个代码 Agent 的任务、MCP、
Git 或 shell API，也不接管 Ollama 生命周期。

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

内容只读、snapshot sync、Agent 会话、Provider/Profile 管理、仓库管理与 automation
token 均继续属于唯一 `/api/v3` registry。不存在 `/api/v2`、公开 command API、
preview/commit、写入 automation scope 或兼容 parser。

完整 method、path、schema 和访问策略从 `GET /api/v3/openapi.json` 读取；本节只列出
服务配置与登录所需的主要入口，不维护第二份 operation catalog。

## 7. 构建与验证

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
