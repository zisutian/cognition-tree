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
    独立 tests/ 单元测试目录

已完成 TypeScript CTN 解析器：

    parseCtnDocument(source)
    roots
    blocks
    diagnostics

解析器当前支持缩进层级、行首符号识别、块树构建和基础诊断。CodeMirror 6 已完成基础接入，笔记可按目录树组织；Tauri 桌面运行时保存为本地文件。

前端领域层中，笔记记录模型和仓库目录树操作已拆分：笔记模型负责内容、标题和语法归属，目录树操作负责文件夹查找、笔记挂载、文件夹变更和笔记移动。

新仓库默认从空笔记库开始，仅保留“仓库根目录”。点击“新建笔记”后才会创建第一篇 `.ctn`。目录树支持通过右键菜单新建文件夹、重命名文件夹、删除文件夹和移动笔记；删除文件夹会一并移除其中笔记。

仓库接近 Obsidian vault：它是一个长期知识域和本地文件夹边界，而不是单篇笔记的位置。文件夹只负责组织、浏览、移动和新建落点，不绑定语法配置。仓库可以保存多套 CTN 语法，笔记记录实际使用的语法 ID 和版本。

当前默认文件仓库目录：

    ~/.local/share/dev.zisutian.cognition-tree/repositories/local-workspace/

仓库目录内：

    workspace.json
    notes/*.ctn

左侧“存储”区会显示当前仓库文件夹，可通过“更改”切换到另一个仓库文件夹。

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

## 代码结构

    src/ctn/
        CTN 语法解析核心，只负责 source text、syntax profile、blocks、roots 和 diagnostics。

    src/domain/
        前端领域模型。notes.ts 负责笔记、workspace 和语法归属；noteTree.ts 负责仓库目录树操作。

    src/editor/
        CodeMirror 6 集成层。CtnEditor.tsx 是 React 容器，扩展、语义装饰和诊断提示分别拆分维护。

    src/components/
        React 展示组件和工作台布局。组件表达用户交互，不直接承担持久化和领域树算法。

    src/hooks/
        前端状态编排层，连接领域模型、存储适配器和 UI。

    src/storage/
        前端存储端口和 Tauri 适配器。

    tests/
        前端单元测试目录，按 src 模块边界组织。

    src-tauri/
        Tauri / Rust 桌面后端，负责本地文件仓库、commands、权限和应用打包资源。

## 开发命令

    pnpm install
    pnpm start
    pnpm tauri dev
    pnpm test
    pnpm check
    pnpm build

前端开发服务器仅用于界面调试，不提供笔记文件保存：

    pnpm dev

`pnpm start` 会调用 `scripts/start.sh`，从项目根目录启动桌面端开发模式。

Rust / Tauri 后端检查：

    cd src-tauri
    cargo check

## 许可证

    GPL-3.0-or-later
