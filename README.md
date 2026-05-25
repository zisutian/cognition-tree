# 认知树

本地优先的可配置语法认知树笔记软件。

认知树不是 Markdown 编辑器，也不是传统富文本笔记。它的目标是用可配置的 `.ctn` 语法记录概念、定义、条件、疑问、组分、自我理解、证据、例子和它们之间的关系。

## 当前状态

已完成桌面端最小工作台：

    左侧 Activity Bar + Side Panel 工作区入口
    中间 CodeMirror 6 原文编辑区
    右侧结构树和诊断统计
    Tauri 文件笔记仓库适配层
    笔记内容和仓库目录树的前端领域模型

已完成 TypeScript CTN 解析器：

    parseCtnDocument(source)
    roots
    blocks
    diagnostics

解析器当前支持缩进层级、行首符号识别、块树构建和基础诊断。CodeMirror 6 已完成基础接入，笔记可按目录树组织；Tauri 桌面运行时保存为本地文件。

当前默认文件仓库目录：

    ~/.local/share/dev.zisutian.cognition-tree/repositories/local-workspace/

仓库目录内：

    workspace.json
    notes/*.ctn

## 技术栈

    Tauri 2
    Vite
    React
    TypeScript
    CodeMirror 6
    Rust
    TypeScript CTN 解析器
    Vitest
    pnpm

后续接入：

    SQLite + JSON1 索引缓存

## 文档索引

    docs/核心要求.txt
    docs/环境准备.txt
    docs/逐步构建流程.txt
    docs/认知树笔记软件需求说明.txt
    docs/开源许可策略.txt

## 开发命令

    pnpm install
    pnpm tauri dev
    pnpm test
    pnpm check
    pnpm build

前端开发服务器仅用于界面调试，不提供笔记文件保存：

    pnpm dev

Rust / Tauri 后端检查：

    cd src-tauri
    cargo check

## 许可证

    GPL-3.0-or-later
