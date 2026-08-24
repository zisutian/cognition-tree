# 认知树

认知树是 Server-backed 的可配置语法结构化笔记应用。它用 `.ctn` 原文、缩进、语法规则和引用关系组织知识，并提供独立的日记与代办领域。

## 内容领域

- Workspace：零个或多个普通笔记库，支持目录、编辑、结构整理、引用图谱和多份仓库语法。
- Journal：全局唯一。手动创建一天多条日记，固定标题为 `YYYY-MM-DD-0001`，左侧按“年 → 月 → 条目”倒序显示；支持仓内引用和 `[[仓库名:笔记名]]`。
- Todo：全局唯一。每个事项集合是一篇 CTN，`[]` 表示任务，缩进表示父子关系；普通完成与周期阶段、发生日期和完成历史保存于独立 sidecar。

Journal 与 Todo 不依赖当前普通仓库，也不参与 WebDAV。它们的存储位置、故障与重试统一显示在“仓库 → 内置数据”中。

## 主要能力

- Local 与 WebDAV 普通仓库的创建、切换、重命名和安全删除。
- Local 所见即所得目录：文件夹对应目录，笔记对应以标题命名的 `.ctn` 文件。
- CTN 编辑、块结构、跨笔记结构移动、引用导航和图谱。
- 系统语法（日记、代办）与笔记库多语法配置；普通语法的“打开编辑”和“实际启用”相互独立。
- 页面生命周期内的乐观编辑、内存待同步队列、CAS 同步与显式冲突处理。
- Todo 支持按天、周、月的本地日历周期、规则阶段和不丢失的完成统计；规则在结构行内配置。
- 提供唯一 `/api/v3` 契约：自动化只读内容/搜索/SSE，官方客户端 owner-only snapshot sync，以及 owner-only Agent 会话、proposal 审批与审计；不存在公开写 command API。
- 固定 Agent Activity 支持 allowlist Codex app-server 与 OpenAI-compatible profile。模型只能在会话硬范围内读取和暂存，owner 审查聚合 diff 后才以 exact CAS 写入；删除还需要独立二次确认。
- 按 Activity 投影 diagnostics、运行故障和操作错误；短暂反馈与非稳定保存状态统一进入底栏，设置页不挂载问题面板。

没有健康普通仓库时仍挂载完整工作台：日记、代办、仓库和设置保持可用，普通内容活动提供创建仓库入口。

## 本地运行

要求 Node.js 22、pnpm 11.1.3 和 Git。

    pnpm install
    pnpm hooks:install
    pnpm server
    pnpm dev

默认地址：

    前端  http://127.0.0.1:5173
    后端  http://127.0.0.1:3001

常用验证：

    pnpm check
    pnpm test
    pnpm test:architecture
    pnpm test:e2e
    pnpm build
    git diff --check

真实 WebDAV 协议验收使用 `pnpm verify:webdav:live`，会运行超过一分钟。容量基准使用 `pnpm benchmark:capacity`。

## 运行配置

后端：

    CTN_API_HOST=127.0.0.1
    CTN_API_PORT=3001
    CTN_REPOSITORY_ROOT=.cognition-tree/repositories
    CTN_REPOSITORY_HOST_ROOT=
    CTN_SERVER_STATE_DIR=.cognition-tree/server
    CTN_WEBDAV_PRIVATE_TARGETS=
    CTN_PUBLIC_URL=
    CTN_API_TOKEN=
    CTN_AGENT_MAX_AUDIT_ENTRIES=1000

前端在页面启动时读取 `public/cognition-tree.config.json`；生产部署对应
`.artifacts/build/client/cognition-tree.config.json`：

    {
      "formatVersion": 1,
      "apiBaseUrl": "http://127.0.0.1:3001",
      "apiToken": "可选 owner token"
    }

`apiBaseUrl` 只接受无凭据、query、fragment 或子路径的绝对 HTTP(S) origin。
配置不会进入 JavaScript bundle，同一构建产物可在启动静态站点前替换或挂载
该文件；缺失或无效时客户端不会启动。

非 loopback 部署必须同时设置至少 32 字符的 `CTN_API_TOKEN` 和 HTTPS `CTN_PUBLIC_URL`。产品面向单用户个人服务，不提供用户、角色或共享权限模型。

## 数据位置

Local 仓库的可见目录是权威工作树：

    仓库/
      .ctn/                  身份、顺序、语法、块元数据和事务
      根笔记.ctn
      项目/
        设计.ctn

可见 `.ctn` 文件只保存编辑器正文；稳定 ID、时间和事务事实位于根部保留目录 `.ctn/`。Local 在加载、提交和手动“重新扫描文件”时读取真实目录，不运行文件 watcher。非 `.ctn` 文件不会进入笔记树，也不会被仓库操作改写或删除。

Server 模式下，普通仓库与内置数据共用一个内容根目录，但保持独立
contract、session 和 API：

    <CTN_REPOSITORY_ROOT>/.built-ins/journal/
    <CTN_REPOSITORY_ROOT>/.built-ins/todo/

`.built-ins/` 是受保护的基础设施目录，不会被 Local catalog 识别为普通
Workspace。`CTN_SERVER_STATE_DIR` 保存 WebDAV 连接、只读 automation token
哈希，以及不含提示词、正文、完整 diff 或 tool output 的 Agent operation
ledger；令牌明文只在创建时显示一次。

Agent provider、profile、模型参数与凭据由“设置 → 智能体”管理，内部状态保存于
`<CTN_SERVER_STATE_DIR>/agent-config-v1/configuration.json`；该文件不是用户仓库
文件，也不应手工编辑。Codex 依赖精确锁定为 `@openai/codex@0.148.0`，每个会话使用独立、
ephemeral、只读且无网络的 app-server 进程和会话专属私有 MCP。Agent 对话只在
服务内存中驻留，重启、TTL 到期或回收会丢失。

前端不持久化 Workspace、Journal、Todo、草稿、同步队列或冲突。它只在内存中
保留当前页面会话的乐观状态，并用 `localStorage` 保存当前普通仓库 ID；刷新或
关闭页面会丢失尚未同步的内存内容。旧版本留下的 IndexedDB 数据不会被读取、
迁移或清理，需要时由用户在浏览器中手动删除。

## 源码层次

    core/             CTN、命名以及互不依赖的 Workspace、Journal、Todo 纯领域
    application/      用例、端口、versioned session，以及 Workbench/Agent 两个协调根
    infrastructure/   client memory/HTTP adapter、versioned persistence 与 Node server
    presentation/     React shell、Activities、CodeMirror 和共享 UI
    contracts/        API registry、Agent、Workspace、Journal、Todo 与 built-ins wire contract
    tooling/          构建、Git、基准脚本与专用 TypeScript 配置
    docs/             产品、架构、工程、环境与界面约定
    tests/            单元、UI、contract 与架构测试
    e2e/              浏览器流程测试

`application/persistence/VersionedSessionController` 统一三个领域的页面内乐观状态、CAS、冲突、重载、丢弃和删除前冻结语义；各领域 controller 只保留自己的校验、投影和命令。`application/workbench/WorkbenchController` 组合普通仓库 catalog、Workspace slot、两个内置 slot 与跨仓导航；`application/agent` 独立拥有硬范围、会话、staging、proposal 与审批状态机，两个协调根互不导入。`AppRoot` 只在 presentation 组合并订阅两套 runtime。client HTTP 与 Server 文件系统实现只存在于 infrastructure，wire 解析只存在于 contracts。

构建、测试和工具缓存统一写入可删除的 `.artifacts/`：客户端和服务端位于
`build/client` 与 `build/server`，客户端启动配置作为独立 JSON 文件复制到
`build/client`，Playwright 与 E2E 运行数据位于 `test/`。
`pnpm clean` 只清除 `.artifacts/`。`.cognition-tree/` 保存本地仓库和服务状态，
不属于生成产物；`node_modules/` 继续由 pnpm 管理。

更具体的约束见：

- [产品需求](docs/product-requirements.md)
- [架构边界](docs/architecture.md)
- [工程原则](docs/engineering-principles.md)
- [环境准备](docs/getting-started.md)
- [界面样式约定](docs/ui-guidelines.md)
