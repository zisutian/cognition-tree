# 认知树

认知树是本地优先的可配置语法结构化笔记应用。它以 `.ctn` 原文、缩进层级、仓库语法和引用关系组织知识，面向概念记录、结构整理和本地文件仓库管理。

## 当前运行形态

当前仓库包含一个浏览器前端和一个 Node HTTP 后端。

    前端：React、Vite、CodeMirror、Canvas 引用图谱。
    后端：Node HTTP API、本地文件与 WebDAV repository adapter。
    存储：默认在 .cognition-tree/repositories 下管理本地仓库，可由服务端配置远端仓库。

每个仓库由稳定的 repository id 标识。本地文件仓库以不可变快照保存内容：

    repository.json
    snapshots/<sha256-revision>/workspace.json
    snapshots/<sha256-revision>/notes/*.ctn
    snapshots/<sha256-revision>/syntax/workspace.toml

`repository.json` 保存 schema version 3、稳定的 catalog label 和当前 revision。快照中的 `workspace.json` 只保存 workspace 身份与目录树；笔记 DTO 只保存稳定 id 和 `.ctn` source。笔记标题与时间从 source 开头的 canonical 标题元数据推导，文件夹以 `folderId` 标识，笔记树节点不重复保存派生 id。每个 canonical CTN 块前保存同缩进的 `@ctn-block` 元数据行；编辑区中的同名普通文本保持可见并产生诊断。

前端也可以切换到浏览器存储模式，用于不连接本机后端的界面验证。

## 当前能力

    笔记：创建、编辑、删除、重命名和移动笔记。
    目录：创建、重命名、删除和移动文件夹。
    编辑器：编辑 CTN 可编辑内容，以 Tab 表达结构层级；多行块内使用独立的代码缩进键位，并可进入保留活动栏的专注模式。
    仓库语法：编辑仓库级语法配置，并用当前配置解析笔记。
    结构操作：在源笔记和目标笔记之间移动结构块，也支持单篇笔记内的结构整理。
    引用导航：通过 Ctrl+点击跳转局部块引用或全局笔记引用，多个目标使用统一选择器。
    引用图谱：查看笔记级引用关系和局部图谱。
    问题：在工作台底部统一检查全仓库解析错误、语法错误和未解析引用，并跳转到对应笔记行或语法字段。
    设置：创建和切换仓库，查看仓库位置与保存状态，并调整按仓库保存的工作台布局。
    离线编辑：保留最近一次确认快照和待同步提交，连接恢复后自动提交或进入显式冲突状态。

搜索和数据活动保留入口，当前作为后续能力的占位页面。

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
    CTN_PUBLIC_URL=
    CTN_API_TOKEN=
    CTN_WEBDAV_REPOSITORIES=[]

前端环境变量：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001
    VITE_CTN_API_TOKEN=
    VITE_CTN_STORAGE_MODE=browser

loopback HTTP 后端只接受 loopback Host 和本机开发前端 Origin。非 loopback 部署必须同时配置至少 32 字符的 `CTN_API_TOKEN` 和 HTTPS `CTN_PUBLIC_URL`；Host、Origin 与 CORS 策略由该公开 URL 推导。前端通过 `VITE_CTN_API_TOKEN` 发送同一 bearer token。

后端通过 `/api/repositories` 列出和创建仓库，通过 `/api/repositories/<repositoryId>/snapshot` 读写指定仓库。浏览器分别保存当前选择的 repository id；切换仓库不会复制内容。

`CTN_WEBDAV_REPOSITORIES` 是服务端 JSON 数组，每项包含 `id`、`label`、`url`，以及可选的成对 `username`、`password`；带凭据时 URL 必须使用 HTTPS。WebDAV adapter 将内容写入不可变 `.ctn-generations/<token>/`，以 60 秒可续租 writer lease 和 current pointer 的 ETag CAS 发布 revision。缺少 ETag 或条件请求能力的服务在注册时被拒绝。本地仓库与 WebDAV 仓库之间没有上传、下载或合并操作。

HTTP repository 的本地 draft、已知远端 revision、catalog 与逐笔记 source 保存在 normalized IndexedDB v3 stores。一次编辑先以 local revision CAS 原子 stage 改变的笔记和状态，再异步同步远端；网络恢复会立即触发同步。远端 revision 已变化时继续保留并允许更新本地 pending 内容，直到显式丢弃或解决冲突。旧 browser storage 与旧 cache 不参与读取。

## 代码结构

    src/app/          应用组合根、workbench 装配和 activity adapter
    src/application/  workspace session、runtime、选择、导航、诊断和 activity 投影
    src/ui/           workbench 布局、activity slots、问题面板、共享组件和样式
    src/workspace/    workspace 数据模型、命令、查询、索引和语法上下文
    src/ctn/          CTN parser 和 syntax profile
    src/storage/      repository 端口、浏览器/HTTP adapter 和运行时组合
    src/editor/       CodeMirror 编辑器适配
    contracts/        前后端共享的 repository wire contract
    server/           repository 规则、catalog、HTTP API 和本地/WebDAV adapter
    tests/            按源码职责镜像的单元、UI 和架构测试
    e2e/              按编辑、结构、活动视图、诊断和仓库流程拆分的浏览器测试及 fixtures

更细的产品、架构、工程和界面约束记录在 `docs/` 下的专题文档中。
