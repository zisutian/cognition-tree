# API 与 CLI 集成

本文件拥有认证类别、外部调用、错误处理及 CLI 操作。令牌的界面创建步骤见
[设置操作](settings.md)，协议的服务端边界见[服务运行](service-runtime.md)。

## Owner、automation 与 trusted-client 认证

仅当请求 socket 和 Host 都是 loopback 时，服务才授予 `local-owner`。反向代理虽然
可能从 loopback socket 连接，但公共 Host 不会被提升为本机 owner。

Cookie 使用 `HttpOnly`、`SameSite=Strict`、`Secure`、`Path=/api/v4`。Cookie 鉴权的
写请求必须带与设置完全相同的 Origin。准备轮换只以 exact CAS 替换一个 pending
摘要；只有显式激活才提升 pending、递增 credential version、废止旧 session，并给执行
激活的浏览器签发新 session。激活请求会把 secret 作为持有证明交回服务端；摘要验证、
状态提升和新 session 签发属于同一权威提交，不经过可竞态的二次状态读取。激活结果未知
时界面保留 secret，供重新载入后用旧 secret 或新 secret 恢复。清除 credential 只允许
在 loopback 模式中进行，并同时清除 pending。

automation 继续使用 Bearer token，但只能拥有 `workspace:read`、`journal:read`、
`todo:read`；Workspace 受 repository ID allowlist 限制。任何显式但无效的 Bearer
都返回 401，绝不会退化为 local-owner。旧 owner Bearer 不再存在。

trusted-client token 也使用 Bearer，但固定拥有全部当前及未来 Workspace、Journal 与
Todo 的读取和 merge-aware snapshot sync。它不能访问 Agent、admin、auth、Provider、
系统设置或仓库创建、重命名、删除。secret 使用 `ctt_` 前缀，只在“设置 → API 访问”
创建时显示一次，撤销后立即失效并关闭该 principal 的 Content SSE。它等价于全部内容
的创建、修改和删除权，只应交给明确受信的外部 Codex 或同步程序。

## API v4

`GET /api/v4/openapi.json` 是 operation method、path、schema 和访问策略的机器可读
权威；根 CLI 的 `./ctn openapi` 输出同一份契约。健康、能力发现和 owner 登录无需已有
owner session，其余操作按 registry 声明的 owner、automation 或 trusted-client policy
授权。文档不手工维护 endpoint 清单。

浏览器与 trusted-client 使用同一 snapshot sync 并接收服务端最终 snapshot；Agent
proposal 不使用此合并路径。不存在 `/api/v2`、公开 command API、preview/commit、
写入 automation scope 或兼容 parser。精确能力与不支持范围见
[产品需求](product-requirements.md#10-当前边界)，数据流和授权模型见
[服务运行](service-runtime.md#存储协议与认证)。

错误响应是带 `code`、`message`、`requestId`、服务端 `retryable` 与严格 `details` 的
判别联合。客户端不得仅凭 HTTP status 猜测能否重试。尤其
`operation_audit_finalize_failed` 表示正文已提交，只能根据 `afterRevision` 重新 GET
对账，不能重放 PUT。

## 外部可信客户端 CLI

根入口 `./ctn` 只调用 `/api/v4`，不会读取 bootstrap、浏览器存储或直接修改仓库目录。
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
    ./ctn request GET /api/v4/capabilities
    ./ctn request GET /api/v4/content/workspaces

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
