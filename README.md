# 认知树

认知树是本地优先的可配置语法结构化笔记应用。它以 `.ctn` 原文、缩进层级、仓库语法和引用关系组织知识，面向概念记录、结构整理和个人仓库管理。

## 当前运行形态

当前仓库包含一个浏览器前端和一个 Node HTTP 后端。

    前端：React、Vite、CodeMirror、Canvas 引用图谱。
    后端：Node HTTP API、本地文件与 WebDAV repository adapter。
    存储：默认在 .cognition-tree/repositories 下管理普通本地仓库，并在 .cognition-tree/server 下保存服务端状态、WebDAV 连接配置以及受保护的日记和代办系统仓库。

每个仓库由稳定的 repository id 标识。Local 仓库的可见目录就是工作区目录，文件夹对应磁盘目录，笔记对应以标题命名的 `.ctn` 文件：

    .ctn/
      repository.json
      index.json
      syntax/
        index.json
        syntax-<uuid>.toml
      note-metadata/<note-id>.json
      transactions/<transaction-id>/...
    根笔记.ctn
    项目/
      设计.ctn
      记录.ctn

可见 `.ctn` 文件只保存编辑器正文，文件名去掉扩展名后与首行标题一致。稳定 note/block ID、时间、上一版正文、目录顺序、仓库语法和写入事务位于仓库根部的保留目录 `.ctn/`；同名普通文本中的 `@ctn-block` 保持可见并产生诊断。Local adapter 在首次加载、同步提交和仓库活动的“重新扫描文件”操作中扫描真实目录，不使用文件 watcher。非 `.ctn` 普通文件视为 unmanaged，不进入笔记树，也不会被仓库操作改写或删除。

Local 写入使用 `.ctn/transactions/` 中的 WAL。可见文件、sidecar 与索引先经过完整校验并 durable 写入事务目录，最后原子替换 `.ctn/repository.json` 作为唯一 commit point。旧 snapshot Local 布局不迁移，读取时报告 `unsupported_repository_version`。WebDAV 继续使用不可变 generation、writer lease 和 ETag CAS；Browser 继续使用 IndexedDB。

前端也可以切换到浏览器存储模式，用于不连接本机后端的界面验证。

## 当前能力

    笔记：创建、编辑、删除、重命名和移动笔记。
    日记：在独立内置仓库中手动创建一天多条 CTN 日记；固定标题为 `YYYY-MM-DD-0001` 形式的当日递增序号，列表按月份和创建时间倒序，并支持仓内引用与 `[[仓库名:笔记名]]` 跨普通仓库引用。
    代办：在独立内置仓库中把每个事项集合保存为一篇层级 CTN；受保护的 `todo-item` 规则默认使用 `[]`，编辑器和详情结构树共享 completion sidecar 中的勾选状态。
    目录：创建、重命名、删除和移动文件夹。
    编辑器：编辑 CTN 可编辑内容，以 Tab 表达结构层级；多行块内使用独立的代码缩进键位，并可进入保留活动栏的专注模式。
    仓库语法：语法活动分为固定的日记、代办系统语法和普通笔记库语法；普通仓库可管理多份语法文件，打开编辑与实际启用是两个独立动作。
    结构操作：在源笔记和目标笔记之间移动结构块，也支持单篇笔记内的结构整理。
    引用导航：通过 Ctrl+点击跳转局部块引用或全局笔记引用，多个目标使用统一选择器。
    引用图谱：查看笔记级引用关系和局部图谱。
    问题：普通活动显示普通 workspace 诊断；仓库活动追加普通与系统仓库及名称问题；日记显示正文、语法、仓内和跨仓引用诊断；代办显示语法与 CTN 诊断；设置不挂载问题面板。
    仓库：以紧凑 master-detail 创建、重命名、选择、切换和删除 Local/WebDAV/Browser 仓库；左侧只显示极简状态和选中行操作，位置、复制、重扫、故障处理与危险操作集中在右侧。日记和代办是全局唯一、不可删除且不可重命名的内置仓库。
    设置：在“界面”页调整按仓库保存的工作台左侧栏宽度；该活动不显示底部问题栏。
    离线编辑：保留最近一次确认快照和待同步提交，连接恢复后自动提交或进入显式冲突状态。

搜索和数据活动保留入口，当前作为后续能力的占位页面。

没有健康普通仓库时仍挂载完整工作台。笔记、结构操作和引用图谱显示前往仓库的创建入口；语法活动仍可编辑日记与代办系统语法，并在“笔记库语法”分组提示创建普通仓库。日记、代办、仓库和设置始终可用。

## 开发命令

安装依赖：

    pnpm install

安装本地 Git hooks：

    pnpm hooks:install

启动本机后端：

    pnpm server

启动前端开发服务：

    pnpm dev

常用验证：

    pnpm check
    pnpm test
    pnpm test:e2e
    pnpm build
    pnpm verify:webdav:live
    git diff --check

固定生成 1000 篇笔记、10 万块并测量索引、投影、完整快照和文件写盘：

    pnpm benchmark:capacity

`pnpm verify:webdav:live` 会启动 loopback TCP 上的文件系统 WebDAV 服务，执行条件请求、双 writer fencing、断线恢复、交错读写和超过 60 秒的 lease 续租验证，因此耗时至少一分钟。

后端脚本语法检查：

    pnpm exec tsc -p tsconfig.server.json --noEmit

本地提交钩子会运行暂存 diff 检查、TypeScript 检查和架构边界测试。提交信息使用 `type(scope): subject` 格式。

## 地址和环境变量

默认地址：

    前端：http://127.0.0.1:5173
    后端：http://127.0.0.1:3001

后端环境变量：

    CTN_API_HOST=127.0.0.1
    CTN_API_PORT=3001
    CTN_REPOSITORY_ROOT=.cognition-tree/repositories
    CTN_REPOSITORY_HOST_ROOT=
    CTN_SERVER_STATE_DIR=.cognition-tree/server
    CTN_WEBDAV_PRIVATE_TARGETS=
    CTN_PUBLIC_URL=
    CTN_API_TOKEN=

前端环境变量：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001
    VITE_CTN_API_TOKEN=
    VITE_CTN_STORAGE_MODE=browser

loopback HTTP 后端只接受 loopback Host 和本机开发前端 Origin。非 loopback 部署必须同时配置至少 32 字符的 `CTN_API_TOKEN` 和 HTTPS `CTN_PUBLIC_URL`；Host、Origin 与 CORS 策略由该公开 URL 推导。前端通过 `VITE_CTN_API_TOKEN` 发送同一 bearer token。

部署模型是单用户个人服务。bearer token、WebDAV 凭据和 lease/CAS 处理同一使用者的受控客户端与多个实例，不建立用户、角色或共享权限模型。

后端通过 `/api/repositories` 列出和创建普通仓库，通过 `/api/repositories/<repositoryId>/snapshot` 读写指定仓库，通过 `PATCH /api/repositories/<repositoryId>` 修改 catalog label，并通过 `DELETE /api/repositories/<repositoryId>?mode=...` 删除托管内容或移除连接。repository id 由 catalog 自动生成，格式为 `repository-<lowercase-uuid>`；workspace 使用独立的 `workspace-<uuid>`。浏览器分别保存当前选择的 repository id；切换或重命名仓库不会复制内容，也不会重建活动 session。

`GET /api/system-repositories` 固定列出 `system-journal` 和 `system-todo`；对应 snapshot endpoint 只提供 load 和 CAS commit，独立 retry endpoint 用于重新加载故障仓库，系统仓库不提供 create、delete 或 rename。HTTP 模式将其保存在 `CTN_SERVER_STATE_DIR/system-repositories/`，Browser 模式使用独立 IndexedDB。Journal 与 Todo 使用各自的 v2 wire contract 和按 purpose 隔离的 storage epoch；发现缺失或旧 v1 epoch 时直接清除该 purpose 的旧 content、local-first draft/cache 并 provision 空 v2，不读取、迁移、备份或提示旧格式。当前 v2 的损坏内容和未知未来 epoch 则保留原值并形成可重试问题，且不会阻断另一个系统仓库。

普通笔记标题、文件夹名、仓库名和 Todo 集合名使用统一可移植名称规则：存储前执行 `trim → NFC → 连续 ASCII 空格折叠`，只允许 Unicode 字母、组合标记、数字、内部普通空格、`-` 和 `_`；唯一性与引用键使用 `NFKC → en-US lowercase`。既有不合规名称保持可读并形成诊断，必须手工重命名，不自动改写。

HTTP 模式的仓库活动可以动态添加和切换 Local/WebDAV 仓库。仓库位置使用结构化数据：Local 显示 realpath 后的服务端路径，并可同时显示由 `CTN_REPOSITORY_HOST_ROOT` 映射的宿主机路径；WebDAV 显示不含凭据的规范化 URL；Browser 显示实际 IndexedDB 数据库名。绝对路径只向已授权的单用户 catalog 前端公开，API 错误、未知 500 和日志不包含单仓路径或凭据。`CTN_REPOSITORY_HOST_ROOT` 必须是绝对路径，只参与展示，不参与读写、删除或权限判断。

WebDAV 连接由名称、URL 和无认证或 Basic 认证组成；初次添加时探测 ETag、条件请求、PROPFIND、MKCOL、PUT、GET 和 DELETE 能力。完全空的目标初始化为 v4 仓库，已有 v4 内容保持为远端事实，非空且不受管理的目标及旧版本目标不会被接管。本地仓库与 WebDAV 仓库之间没有上传、下载或合并操作。Browser 模式只创建和切换 Browser 普通仓库。

WebDAV 连接文件位于 `CTN_SERVER_STATE_DIR/webdav-connections/`。状态目录权限为 `0700`，包含认证信息的配置文件权限为 `0600`；密码不进入 API 响应、日志或 IndexedDB。Basic 认证只用于 HTTPS URL，URL 不包含 userinfo、query 或 fragment，WebDAV 请求不跟随重定向。

WebDAV 网络目标默认限于 global-unicast 地址。`CTN_WEBDAV_PRIVATE_TARGETS` 以逗号或空白分隔精确 origin 和 CIDR，例如 `https://nas.example:5006,192.168.1.0/24,fd00::/8`；匹配项允许私网、loopback、ULA 或 CGNAT 目标。link-local、metadata、unspecified、multicast、broadcast 和 reserved 地址始终被拒绝。每次请求重新解析目标地址并将连接固定到已验证地址。

Local 和 Browser 仓库只提供“删除托管数据”。WebDAV 仓库同时提供“仅移除连接”和“删除远端数据”：前者保留远端文件，后者以 current pointer 的 ETag CAS 发布永久 deletion tombstone，再清理 `.ctn-generations/`，并保留目标中的无关文件。清理未完成时 catalog 显示 `deleting` 问题并继续恢复；tombstone 阻止同一目标被当作空仓库重新初始化。

旧的 `CTN_WEBDAV_REPOSITORIES` 静态配置入口已移除；环境中仍存在该变量时后端拒绝启动。

HTTP repository 的本地 draft、已知远端 revision、catalog 与逐笔记 source 保存在 normalized IndexedDB v4 stores。一次编辑先以 local revision CAS 原子 stage 改变的笔记和状态，再异步同步远端；网络恢复会立即触发同步。远端 revision 已变化时继续保留并允许更新本地 pending 内容，直到显式丢弃或解决冲突。旧 browser storage 与旧 cache 不参与读取。

未来容器部署的路径约定将 catalog root 挂载为 `/data/repositories`，将 server state 挂载为 `/data/server`。Local 仓库必须整体挂载，包含根部 `.ctn/`。当前仓库不提供 Dockerfile、镜像或 Compose 配置。

## 代码结构

    src/app/          应用组合根、workbench 装配和 activity adapter
    src/application/  普通 workspace、repository/system session、workbench 状态、选择、导航、诊断和 activity 投影
    src/ui/           workbench 布局、activity slots、问题面板、共享组件和样式
    src/workspace/    workspace 数据模型、命令、查询、索引和语法上下文
    ctn/              前端与 Local server 共享的纯 CTN parser、metadata reconcile 和 syntax profile 核心
    journal/          前后端共享的日记 v2 内容约束、可配置语法、命令、查询与仓内解析索引
    todo/             前后端共享的代办 v2 CTN 内容约束、completion sidecar、命令、查询与解析索引
    portable-name/    普通笔记、文件夹、仓库和 Todo 集合共享的纯可移植名称规则
    src/storage/      repository 端口、浏览器/HTTP adapter 和运行时组合
    src/editor/       CodeMirror 编辑器适配
    contracts/        前后端共享的普通仓库与系统仓库 wire contract
    server/           普通/系统 repository 规则、catalog、HTTP API 和本地/WebDAV adapter
    tests/            按源码职责镜像的单元、UI 和架构测试
    e2e/              按编辑、结构、活动视图、诊断和仓库流程拆分的浏览器测试及 fixtures

更细的产品、架构、工程和界面约束记录在 `docs/` 下的专题文档中。
