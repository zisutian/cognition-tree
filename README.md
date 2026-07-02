# 认知树

本地优先的可配置语法认知树笔记软件。

认知树不是 Markdown 编辑器，也不是传统富文本笔记。它的目标是用可配置的 `.ctn` 语法记录概念、定义、组分、自我理解、多行内容和它们之间的关系。

## 当前状态

项目处于早期开发阶段，当前路线是浏览器前端 + 本机 HTTP 后端。

已具备的基础能力：

    React / Vite 前端工作台
    CodeMirror 6 原文编辑区
    TypeScript CTN 解析器
    笔记和目录树领域模型
    WorkspaceRepository 存储端口
    HTTP WorkspaceRepository 存储适配器
    Node HTTP 后端最小服务
    Vitest 单元测试

目标文件仓库结构：

    workspace.json
    notes/*.ctn
    syntax/workspace.toml

每个仓库使用一份 TOML 语法文件。当前支持行首 marker、行内规则和受控高亮颜色；块 `type` 是可扩展语义 ID，解析行为由 `role` 控制。

## 运行环境

运行软件需要：

    浏览器
    Node.js LTS
    pnpm

数据保存位置：

    笔记数据保存在本机文件仓库目录。
    后端读写 workspace.json、notes/*.ctn 和 syntax/workspace.toml。
    浏览器只作为界面入口，不作为长期数据存放位置。

当前限制：

    第一版不处理多用户账号、公网部署、桌面安装包和移动端应用。

## 开发环境

参与开发需要：

    Git
    Node.js LTS
    pnpm

可选：

    sqlite3
    libsqlite3-dev
    Docker

SQLite 当前只用于后续索引缓存，不是启动前端和后端的硬性依赖。Docker 后续用于独立容器化阶段，不是当前开发闭环的硬性依赖。Playwright 首次运行浏览器测试时，可能需要额外安装浏览器测试运行时。

基础验证命令：

    git --version
    node -v
    npm -v
    pnpm -v

## 开发命令

    pnpm install
    pnpm server
    pnpm dev
    pnpm test
    pnpm check
    pnpm build

后端脚本语法检查：

    node --check server/index.mjs
    node --check server/workspaceApiServer.mjs
    node --check server/workspaceFileStore.mjs

前端默认访问：

    http://127.0.0.1:5173

后端默认地址：

    http://127.0.0.1:3001

如需切换后端地址：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001 pnpm dev

如需临时使用浏览器本地存储：

    VITE_CTN_STORAGE_MODE=browser pnpm dev

## 代码结构

    src/app/
        React 应用入口和主工作区组合。

    src/features/
        按功能划分的 React 工作区界面，例如 notes、syntax、migration。

    src/shell/
        应用外壳、左侧活动栏和仓库侧栏。

    src/workspace/
        前端 workspace 应用层，负责 session、commands、workspace syntax、parsed note view model 和功能 workflow。

    src/domain/
        笔记、workspace、目录树、块文本和纯领域规则。

    src/ctn/
        CTN 原文解析核心。

    src/syntax/
        语法 profile 类型、TOML 解析和默认语法资源。

    src/editor/
        CodeMirror 6 集成层。

    src/storage/
        前端存储端口和存储适配器。

    src/styles/
        全局样式和按界面区域拆分的 CSS。

    server/
        Web 后端 HTTP API 和文件仓库读写逻辑。

    tests/
        单元测试。

## 许可证与依赖策略

本项目采用 GPL-3.0-or-later。

SPDX 标识：

    GPL-3.0-or-later

新增源代码文件建议添加 SPDX 头部：

    // SPDX-License-Identifier: GPL-3.0-or-later

依赖优先选择源码公开、许可证清晰、可本地构建、可审计的开源技术。

优先级：

    MIT
    Apache-2.0
    BSD-2-Clause
    BSD-3-Clause
    ISC
    Public Domain

默认避免：

    闭源 SDK
    必须联网才能使用的核心服务
    无法审计源码的二进制插件
    专有同步服务
    商业托管功能作为核心依赖
    许可证不清晰的代码片段

引入依赖时应记录包名、版本、许可证、源码地址、是否为运行时依赖、是否可替换。发布版本时应生成第三方许可证清单。

本节是项目工程策略，不构成法律意见。
