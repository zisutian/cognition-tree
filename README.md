# 认知树

认知树是本地优先的可配置语法结构化笔记应用。它用 `.ctn` 原文、缩进、语法规则和引用关系组织知识，并提供独立的日记与代办领域。

## 内容领域

- Workspace：零个或多个普通笔记库，支持目录、编辑、结构整理、引用图谱和多份仓库语法。
- Journal：全局唯一。手动创建一天多条日记，固定标题为 `YYYY-MM-DD-0001`，左侧按“年 → 月 → 条目”倒序显示；支持仓内引用和 `[[仓库名:笔记名]]`。
- Todo：全局唯一。每个事项集合是一篇 CTN，`[]` 表示任务，缩进表示父子关系，完成状态保存于独立 sidecar。

Journal 与 Todo 不依赖当前普通仓库，也不参与 WebDAV。它们的存储位置、故障与重试统一显示在“仓库 → 内置数据”中。

## 主要能力

- Local、WebDAV 与 Browser 普通仓库的创建、切换、重命名和安全删除。
- Local 所见即所得目录：文件夹对应目录，笔记对应以标题命名的 `.ctn` 文件。
- CTN 编辑、块结构、跨笔记结构移动、引用导航和图谱。
- 系统语法（日记、代办）与笔记库多语法配置；普通语法的“打开编辑”和“实际启用”相互独立。
- 本地优先缓存、离线编辑、CAS 同步与显式冲突处理。
- 按 Activity 投影的问题面板；设置页不挂载问题面板。

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

前端：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001
    VITE_CTN_API_TOKEN=
    VITE_CTN_STORAGE_MODE=browser

非 loopback 部署必须同时设置至少 32 字符的 `CTN_API_TOKEN` 和 HTTPS `CTN_PUBLIC_URL`。产品面向单用户个人服务，不提供用户、角色或共享权限模型。

## 数据位置

Local 仓库的可见目录是权威工作树：

    仓库/
      .ctn/                  身份、顺序、语法、块元数据和事务
      根笔记.ctn
      项目/
        设计.ctn

可见 `.ctn` 文件只保存编辑器正文；稳定 ID、时间和事务事实位于根部保留目录 `.ctn/`。Local 在加载、提交和手动“重新扫描文件”时读取真实目录，不运行文件 watcher。非 `.ctn` 文件不会进入笔记树，也不会被仓库操作改写或删除。

HTTP 内置数据分别保存在：

    <CTN_SERVER_STATE_DIR>/built-ins/journal/
    <CTN_SERVER_STATE_DIR>/built-ins/todo/

Browser 模式使用隔离的 `cognition-tree.journal` 与 `cognition-tree.todo` IndexedDB。普通 Workspace 使用 v4，Journal 与 Todo 使用各自 v3 contract；旧格式不读取、不迁移。

## 源码层次

    core/             CTN、命名以及互不依赖的 Workspace、Journal、Todo 纯领域
    application/      用例、端口、会话、Workbench 协调和问题投影
    infrastructure/   versioned persistence、Browser/HTTP adapter 与 Node server
    presentation/     React shell、Activities、CodeMirror 和共享 UI
    contracts/        Workspace、Journal、Todo 与 built-ins wire contract
    tests/            单元、UI、contract 与架构测试
    e2e/              浏览器流程测试

更具体的约束见：

- [产品需求](docs/产品需求.txt)
- [架构边界](docs/架构边界.txt)
- [工程原则](docs/工程原则.txt)
- [环境准备](docs/环境准备.txt)
- [界面样式约定](docs/界面样式约定.txt)
