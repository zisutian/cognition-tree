# 认知树

认知树是 Server-backed 的可配置语法结构化笔记应用。它用 `.ctn` 原文、缩进、语法规则和引用关系组织知识，并提供独立的日记与代办领域。

## 内容领域

- Workspace：零个或多个普通笔记库，支持目录、编辑、结构整理、引用图谱和多份仓库语法。
- Journal：全局唯一。手动创建一天多条日记，固定标题为 `YYYY-MM-DD-0001`，左侧按“年 → 月 → 条目”倒序显示；支持仓内引用和 `[[仓库名:笔记名]]`。
- Todo：全局唯一。每个事项集合是一篇 CTN，`[]` 表示任务，缩进表示父子关系；普通完成与周期阶段、发生日期和完成历史保存于独立 sidecar。

Journal 与 Todo 不依赖当前普通仓库。它们的存储位置、故障与重试统一显示在“仓库 → 内置数据”中。

## 主要能力

- 本地普通仓库的创建、切换、重命名和安全删除。
- 所见即所得的本地目录：文件夹对应目录，笔记对应以标题命名的 `.ctn` 文件。
- CTN 编辑、块结构、跨笔记结构移动、引用导航和图谱。
- 系统语法（日记、代办）与笔记库多语法配置；普通语法的“打开编辑”和“实际启用”相互独立。
- 页面生命周期内的乐观编辑、内存待同步队列、CAS 同步与显式冲突处理。
- Todo 支持按天、周、月的本地日历周期、规则阶段和不丢失的完成统计；规则在结构行内配置。
- 提供唯一 `/api/v3` 契约：自动化只读内容/搜索/SSE，官方客户端 owner-only snapshot sync，以及 owner-only Agent 会话、proposal 审批与审计；不存在公开写 command API。
- 固定智能体 Activity 支持 Codex app-server、OpenAI-compatible 与直连 Ollama profile。模型只能在会话硬范围内读取和暂存，owner 审查聚合 diff 后才以 exact CAS 写入；删除还需要独立二次确认。
- 按 Activity 投影 diagnostics、运行故障和操作错误；短暂反馈与非稳定保存状态统一进入底栏，设置页不挂载问题面板。

没有健康普通仓库时仍挂载完整工作台：日记、代办、仓库和设置保持可用，普通内容活动提供创建仓库入口。

## 本地运行

要求 Node.js 22.18.0 或更高版本、pnpm 11.1.3 与 Git。Ollama、Codex 或其他模型
服务是可选的独立运行时，不是认知树的启动前置条件。

    ./start.sh

生产构建完成后使用同一个 supervisor 启动静态资源模式：

    pnpm build
    ./start.sh --production

`start.sh` 默认使用开发 middleware；`--production` 使用已构建静态资源。两者都会在
首次运行时安装锁文件中的依赖、接入项目已有的 Git 提交钩子，并以
单进程 supervisor 启动认知树。Node 同时拥有网页、API、开发 HMR 与生产静态资源；
脚本不会启动、停止、下载或探测 Ollama。设置或数据迁移要求重启时，只有专用退出
状态会触发自动重启，其他退出状态原样传播。

默认地址：

    http://127.0.0.1:3001

常用验证：

    pnpm check
    pnpm test
    pnpm test:architecture
    pnpm test:e2e
    pnpm build
    git diff --check

容量基准使用 `pnpm benchmark:capacity`，覆盖本地文件仓库与浏览器到服务端的同步路径。

## 运行配置

所有用户配置都在“设置”内管理，不读取监听、端口、路径、owner token、审计容量或
私网目标环境变量。首次启动固定为本机 `127.0.0.1:3001`，数据根为项目
`.cognition-tree`，Agent 审计容量为 1000。浏览器与 API 必须同源，客户端只请求
相对 `/api/v3`，不存在独立启动配置文件。

“设置 → 服务”管理本机/局域网模式、端口、HTTPS 公开 origin、数据根、宿主机显示
路径、审计容量和 owner credential。局域网模式固定绑定 `0.0.0.0`，必须先创建
owner credential，并填写由外部反向代理终止 TLS 的 HTTPS origin。远程浏览器用
一次展示的 owner secret 换取 12 小时 HttpOnly Cookie；automation Bearer token
仍严格只读。Provider 的非 loopback 私网许可在对应 Provider 中逐版本确认。

## 数据位置

固定控制区是项目根 `.cognition-tree/bootstrap-v1/configuration.json`；它只保存当前
数据根指针、服务配置、owner credential 摘要和 session 签名材料，不随数据根迁移。
数据根迁移只
复制 `repositories/`、`server/access-v1/`、`server/agent-config-v1/` 与
`server/agent-v2/`，逐文件比较数量、大小和 SHA-256 后才切换指针；旧数据根原样
保留，不自动删除。bootstrap 损坏时只在 `127.0.0.1:3001` 启动恢复页面，不加载
内容、Agent 或凭据。

本地仓库的可见目录是权威工作树：

    仓库/
      .ctn/                  身份、顺序、语法、块元数据和事务
      根笔记.ctn
      项目/
        设计.ctn

可见 `.ctn` 文件只保存编辑器正文；稳定 ID、时间和事务事实位于根部保留目录 `.ctn/`。服务在加载、提交和手动“重新扫描文件”时读取真实目录，不运行文件 watcher。非 `.ctn` 文件不会进入笔记树，也不会被仓库操作改写或删除。

Server 模式下，普通仓库与内置数据共用一个内容根目录，但保持独立
contract、session 和 API：

    <当前数据根>/repositories/.built-ins/journal/
    <当前数据根>/repositories/.built-ins/todo/

`.built-ins/` 是受保护的基础设施目录，不会被普通仓库 catalog 识别。
`<当前数据根>/server` 保存只读 automation token 哈希、Agent 配置，以及不含
提示词、正文、完整 diff 或 tool output 的 Agent operation ledger；令牌明文只在
创建时显示一次。

普通仓库只能位于 `<当前数据根>/repositories`。容器部署必须将
该目录完整挂载为持久卷；从局域网浏览页面或调用 API 只是在远程访问服务，不会把
仓库存储变成远程文件系统。

Agent provider、profile、模型参数与凭据由“设置 → 智能体”管理，内部状态保存于
`<当前数据根>/server/agent-config-v1/configuration.json`；该文件不是用户仓库
文件，也不应手工编辑。secret 依赖 0600 文件权限，不承诺静态加密；能够读取服务
账号文件的主体仍能取得密钥。首次读取旧的无私网许可格式时，服务会原子升级该内部
状态；既有 Provider/Profile 保留，但不会继承任何旧的私网许可。旧符合性摘要也会
因 Provider digest 变化而失效，chat Profile 需要重新执行符合性检查。Ollama 直接
连接模型层，不调用其他代码 Agent 的任务 API、MCP、Git、shell 或 ChangeSet。
Codex 依赖精确锁定为 `@openai/codex@0.148.0`，每个会话使用独立、
ephemeral、只读且无网络的 app-server 进程和会话专属私有 MCP。Agent 对话只在
服务内存中驻留，重启、TTL 到期或回收会丢失。

本机 Ollama 的镜像、GPU、模型卷与生命周期由 Ollama 自身管理。认知树根部的
`./start.sh` 不会接管它；在
“设置 → 智能体”中添加 Ollama provider 时，服务根地址填写
`http://127.0.0.1:11434`。认知树运行时只调用 `/api/tags` 与
`/v1/chat/completions`，不会停止 Ollama 或下载模型。

前端不持久化 Workspace、Journal、Todo、草稿、同步队列或冲突。它只在内存中
保留当前页面会话的乐观状态，并用 `localStorage` 保存当前普通仓库 ID；刷新或
关闭页面会丢失尚未同步的内存内容。旧版本留下的 IndexedDB 数据不会被读取、
迁移或清理，需要时由用户在浏览器中手动删除。

## 源码层次

    core/             CTN、命名以及互不依赖的 Workspace、Journal、Todo 纯领域
    application/      用例、端口、versioned session，以及 Workbench/Agent/System 边界
    infrastructure/   client memory/HTTP adapter、versioned persistence 与 Node server
    presentation/     React shell、Activities、CodeMirror 和共享 UI
    contracts/        API registry、Agent、Workspace、Journal、Todo 与 built-ins wire contract
    tooling/          构建、Git、基准脚本与专用 TypeScript 配置
    docs/             产品、架构、工程、环境与界面约定
    tests/            单元、UI、contract 与架构测试
    e2e/              浏览器流程测试

`application/persistence/VersionedSessionController` 统一三个领域的页面内乐观状态、CAS、冲突、重载、丢弃和删除前冻结语义；各领域 controller 只保留自己的校验、投影和命令。`application/workbench/WorkbenchController` 组合普通仓库 catalog、Workspace slot、两个内置 slot 与跨仓导航；`application/agent` 独立拥有硬范围、会话、staging、proposal 与审批状态机；`application/system` 只拥有服务配置端口和状态机。`AppRoot` 是客户端显式组合根。client HTTP 与 Server 文件系统实现只存在于 infrastructure，wire 解析只存在于 contracts。

构建、测试和工具缓存统一写入可删除的 `.artifacts/`：客户端和服务端位于
`build/client` 与 `build/server`，Playwright 与 E2E 运行数据位于 `test/`。
`pnpm clean` 只清除 `.artifacts/`。`.cognition-tree/` 保存本地仓库和服务状态，
不属于生成产物；`node_modules/` 继续由 pnpm 管理。

更具体的约束见：

- [产品需求](docs/product-requirements.md)
- [架构边界](docs/architecture.md)
- [工程原则](docs/engineering-principles.md)
- [环境准备](docs/getting-started.md)
- [界面样式约定](docs/ui-guidelines.md)
