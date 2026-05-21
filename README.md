# 认知树

认知树是一个本地优先的认知树笔记软件。它的目标不是做 Markdown 编辑器，也不是传统富文本笔记，而是提供一种可配置语法的结构化编辑方式，用于记录概念、定义、条件、疑问、组分、自我理解、证据、例子和它们之间的关系。

第一阶段优先实现桌面端最小闭环：编辑 `.ctn` 纯文本源文件，解析缩进和语义符号，生成稳定的块树结构，并保存到本地 SQLite。

## 当前进度

已初始化 `Tauri 2 + Vite + React + TypeScript` 桌面应用骨架。

当前启动界面是一个最小认知树工作台：

    左侧笔记列表
    中间 .ctn 原文编辑区
    右侧缩进结构预览

当前结构预览由 TypeScript 解析器模块驱动。解析器已经输出根块树、扁平块列表和诊断信息，后续会接入 CodeMirror 6 的语法装饰、缩进提示和错误提示。

## 第一阶段技术栈

    Tauri 2
    Vite
    React
    TypeScript
    CodeMirror 6
    TypeScript 自研解析器
    Rust
    SQLite + JSON1
    Vitest
    Playwright
    pnpm

暂缓到后续阶段：

    FTS5 搜索索引
    ProseMirror / TipTap / Lexical
    插件系统
    图谱视图
    同步能力
    AI 辅助整理

## 依赖说明

### Git

用于版本控制、跨 Linux 和 Windows 同步代码，以及向 GitHub 推送变更。

### Node.js LTS

用于运行前端开发工具链。Vite、React、TypeScript、CodeMirror 6、Vitest 和 Playwright 都依赖 Node.js 生态。

项目要求使用独立安装的 Node.js LTS，不依赖编辑器或 Codex 内置的临时 Node 环境。

### pnpm

用于管理前端依赖。相比直接使用 npm，pnpm 更适合长期项目：依赖安装更快，磁盘占用更少，锁文件也更稳定。

推荐通过 corepack 启用：

    corepack enable
    corepack prepare pnpm@latest --activate

### Rust stable

Tauri 的后端和桌面壳依赖 Rust。项目中的本地文件访问、SQLite 访问、系统能力和 Tauri commands 都会由 Rust 承担。

Linux 使用 stable toolchain。Windows 需要 stable-msvc toolchain。

### Tauri 2

用于构建跨平台桌面应用。第一阶段使用 Tauri 2 作为桌面壳，前端由 React/Vite 提供，后端能力由 Rust 提供。

Tauri 在不同系统上依赖不同的系统组件：

    Linux 需要 WebKitGTK 和若干开发库。
    Windows 需要 Microsoft C++ Build Tools 和 Microsoft Edge WebView2 Runtime。

官方前置要求：

    https://v2.tauri.app/start/prerequisites/

### Vite

用于前端开发和构建。它负责启动开发服务器、处理 React/TypeScript 编译，并为 Tauri 提供前端构建产物。

### React

用于实现应用界面，例如笔记列表、编辑器区域、结构视图、搜索面板、设置界面和导出界面。

第一阶段选择 React，是为了降低生态和调试风险，把主要复杂度集中在编辑器、解析器和数据模型上。

### TypeScript

用于前端应用、编辑器扩展和第一阶段解析器。它可以让语法配置、块类型、解析结果和 UI 状态保持明确的类型约束。

### CodeMirror 6

用于实现 `.ctn` 原文编辑器。它适合处理文本、缩进、快捷键、语法高亮、行级装饰、折叠、作用域提示和结构视图联动。

第一阶段不使用 ProseMirror、TipTap 或 Lexical 作为主编辑器，因为当前核心输入是可解析的纯文本语法，而不是富文本文档模型。

### TypeScript 自研解析器

用于把 `.ctn` 原文解析成语义块树。

解析器负责：

    按行切分
    计算缩进层级
    识别行首符号
    识别行内符号
    构建父子块关系
    输出语义块模型

第一阶段先用 TypeScript 实现，方便直接服务 CodeMirror 装饰、结构视图和 Vitest 测试。后续如需 CLI、批量迁移或后台索引一致性，再评估 Rust 解析器。

### SQLite + JSON1

用于本地数据存储。笔记、块、链接、语法配置等数据会优先保存到本地 SQLite。

JSON1 用于保存可扩展配置和块属性，例如语法配置 JSON、块 props 等。

第一阶段需要 SQLite 运行库和开发库。开发和调试时建议安装 `sqlite3` 命令行工具。

### FTS5

用于后续全文搜索索引。第一阶段先实现标题和正文的基础搜索，等数据模型稳定后再接入 FTS5，避免过早引入中文搜索和索引维护复杂度。

### Vitest

用于前端和解析器单元测试。解析器规则、缩进层级、块类型识别、行内符号识别和语法配置冲突检测都应优先用 Vitest 固定行为。

### Playwright

用于端到端测试。后续可覆盖创建笔记、编辑缩进块、搜索、导出、窗口行为等用户流程。

Playwright 首次运行可能需要安装浏览器测试运行时。

### SQLite 命令行工具

用于开发调试数据库。它不是应用运行时 UI 的一部分，但在检查表结构、调试数据迁移、验证 JSON1/FTS5 能力时很有用。

### Linux 系统依赖

Ubuntu / Debian 推荐安装：

    sudo apt update
    sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev sqlite3 libsqlite3-dev

用途说明：

    libwebkit2gtk-4.1-dev：Tauri 在 Linux 上渲染 WebView 需要。
    build-essential：提供 gcc、g++、make 等本地编译工具。
    curl / wget：安装工具链和下载构建依赖时常用。
    file：构建和打包流程中用于识别文件类型。
    libxdo-dev：Linux 桌面自动化和窗口相关能力可能需要。
    libssl-dev：Rust crate 或网络/加密相关依赖编译时可能需要。
    libayatana-appindicator3-dev：系统托盘、应用指示器等桌面集成能力可能需要。
    librsvg2-dev：图标和 SVG 渲染相关能力可能需要。
    sqlite3：SQLite 命令行调试工具。
    libsqlite3-dev：编译或链接 SQLite 相关依赖时需要。

### Windows 系统依赖

Windows 验证和打包环境需要：

    Git
    Node.js LTS
    pnpm
    Rust stable-msvc
    Visual Studio 2022 C++ Build Tools
    Microsoft Edge WebView2 Runtime
    SQLite 命令行工具，或随应用开发依赖安装 SQLite 开发库

用途说明：

    Visual Studio 2022 C++ Build Tools：Tauri 和 Rust 原生依赖在 Windows 上编译需要。
    Microsoft Edge WebView2 Runtime：Tauri 在 Windows 上渲染应用界面需要。
    Rust stable-msvc：Windows 上推荐使用 MSVC 工具链构建 Tauri 应用。

## 当前 Linux 环境状态

截至 2026-05-20，当前 Linux 第一阶段开发依赖已补齐。

已确认具备：

    Git
    Node.js LTS
    npm
    corepack
    pnpm 11.1.3
    Rust stable
    cargo
    pkg-config
    WebKitGTK 4.1 开发库
    SQLite 命令行工具
    SQLite 开发库
    Tauri 2 Linux 系统依赖
    build-essential
    curl
    wget
    file

后续恢复用命令：

    sudo apt update
    sudo apt install pkg-config libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev sqlite3 libsqlite3-dev
    corepack enable
    corepack prepare pnpm@latest --activate
    pnpm --version

本机已安装包和后续清理命令记录在：

    docs/环境准备.txt

## 开发命令

安装依赖：

    pnpm install

前端开发服务器：

    pnpm dev

桌面端开发模式：

    pnpm tauri dev

前端类型检查：

    pnpm check

单元测试：

    pnpm test

前端生产构建：

    pnpm build

Rust / Tauri 后端检查：

    cd src-tauri
    cargo check

## 更多文档

    docs/认知树笔记软件需求说明.txt
    docs/环境准备.txt
    docs/开源许可策略.txt

## 许可证

本项目采用 GPL-3.0-or-later。
