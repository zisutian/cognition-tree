# 认知树

认知树是本地优先的可配置语法结构化笔记应用。它以 `.ctn` 原文、缩进层级、仓库语法和引用关系组织知识，面向概念记录、结构整理和本地文件仓库管理。

## 当前运行形态

当前仓库包含一个浏览器前端和一个 Node HTTP 后端。

    前端：React、Vite、CodeMirror、Canvas 引用图谱。
    后端：Node HTTP API、本地文件与 WebDAV repository adapter。
    存储：默认在 .cognition-tree/repositories 下管理本地仓库，可由服务端配置远端仓库。

每个仓库由稳定的 repository id 标识，数据文件按仓库结构生成和读取：

    workspace.json
    notes/*.ctn
    syntax/workspace.toml

`workspace.json` 使用 schema version 2。笔记稳定写入 `notes/<noteId>.ctn`，目录关系只由 manifest tree 表达；每个 CTN 块前保存同缩进的 `@ctn-block` 元数据行。该保留行只存在于持久化原文中，编辑区只显示可编辑内容；笔记自身时间和当前块时间在笔记详情中分别查看。

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
    git diff --check

固定生成 1000 篇笔记、10 万块并测量索引、投影、完整快照和文件写盘：

    pnpm benchmark:capacity

后端脚本语法检查：

    pnpm exec tsc -p tsconfig.server.json --noEmit

将未版本化仓库一次性迁移到 repository v2：

    pnpm repository:migrate-v2 -- /absolute/path/to/repository

迁移前应停止使用目标仓库的后端。命令先在仓库同级目录保留完整 v1 备份，再生成并校验临时 v2 仓库，最后通过目录重命名切换；运行时不读取 v1 manifest。

本地提交钩子会运行暂存 diff 检查、TypeScript 检查和架构边界测试。提交信息使用 `type(scope): subject` 格式。

## 地址和环境变量

默认地址：

    前端：http://127.0.0.1:5173
    后端：http://127.0.0.1:3001

后端环境变量：

    CTN_API_HOST=127.0.0.1
    CTN_API_PORT=3001
    CTN_REPOSITORY_ROOT=.cognition-tree/repositories
    CTN_API_ALLOWED_HOSTS=
    CTN_API_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
    CTN_API_TOKEN=
    CTN_WEBDAV_REPOSITORIES=[]

前端环境变量：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001
    VITE_CTN_API_TOKEN=
    VITE_CTN_STORAGE_MODE=browser

loopback HTTP 后端默认只接受 loopback Host 和本机开发前端 Origin。绑定到非 loopback 地址时必须配置至少 32 字符的 `CTN_API_TOKEN`；绑定到 `0.0.0.0` 或 `::` 时还必须配置 `CTN_API_ALLOWED_HOSTS`。前端通过 `VITE_CTN_API_TOKEN` 发送同一 bearer token。使用其它前端地址时，通过 `CTN_API_ALLOWED_ORIGINS` 显式加入对应 Origin。

后端通过 `/api/repositories` 列出和创建仓库，通过 `/api/repositories/<repositoryId>/snapshot` 读写指定仓库。浏览器分别保存当前选择的 repository id；切换仓库不会复制内容。

`CTN_WEBDAV_REPOSITORIES` 是服务端 JSON 数组，每项包含 `id`、`label`、`url`，以及可选的成对 `username`、`password`。WebDAV 作为独立 repository adapter 直接读写远端文件；本地仓库与 WebDAV 仓库之间没有上传、下载或合并操作。

HTTP repository 的最近确认快照与待同步提交保存在浏览器 IndexedDB。网络不可用时，已有缓存的仓库仍可编辑；恢复连接后，远端 revision 未变化则自动同步，已变化则保留本地内容并要求显式丢弃或后续解决冲突。

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
