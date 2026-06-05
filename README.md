# 认知树

本地优先的可配置语法认知树笔记软件。

认知树不是 Markdown 编辑器，也不是传统富文本笔记。它的目标是用可配置的 `.ctn` 语法记录概念、定义、组分、自我理解、代码片段、语法规则和它们之间的关系。

## 当前状态

已完成前端最小工作台：

    左侧 Activity Bar + Side Panel 工作区入口
    中间 CodeMirror 6 原文编辑区
    右侧结构树和诊断统计
    笔记内容和仓库目录树的前端领域模型
    NoteRepository 前端存储端口
    Web 后端最小 HTTP API
    独立 tests/ 单元测试目录

已完成 TypeScript CTN 解析器：

    parseCtnDocument(source)
    roots
    blocks
    diagnostics

解析器当前支持缩进层级、行首符号识别、块树构建和基础诊断。CodeMirror 6 已完成基础接入，笔记可按目录树组织；当前主线是浏览器前端访问 Docker 后端，由 Docker volume 保存笔记文件。

前端领域层中，笔记记录模型和仓库目录树操作已拆分：笔记模型负责内容、标题和语法归属，目录树操作负责文件夹查找、笔记挂载、文件夹变更和笔记移动。

新仓库默认从空笔记库开始，仅保留“仓库根目录”。点击“新建笔记”后才会创建第一篇 `.ctn`。目录树支持通过右键菜单新建文件夹、重命名文件夹、删除文件夹和移动笔记；删除文件夹会一并移除其中笔记。

仓库接近 Obsidian vault：它是一个长期知识域和本地文件夹边界，而不是单篇笔记的位置。文件夹只负责组织、浏览、移动和新建落点，不绑定语法配置。仓库可以保存多套 CTN 语法资源，笔记记录实际使用的语法 ID 和版本；后续会支持通过普通可见笔记中的语法块导入有效语法，并在跨笔记块迁移时随迁必要的语法引用。

目标 Docker 数据卷内仍沿用文件仓库结构：

    workspace.json
    notes/*.ctn

左侧“存储”区后续会显示后端服务和数据卷位置。当前 HTTP 前端适配器接入前，浏览器开发模式暂用 localStorage 保存工作区。

## 技术栈

    Vite
    React
    TypeScript
    CodeMirror 6
    TypeScript CTN 解析器
    Vitest
    pnpm
    Docker

后续接入：

    HTTP NoteRepository
    SQLite + JSON1 索引缓存

桌面路线不属于当前分支；如需恢复，应从 main 或 git 历史派生。

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
        前端存储端口。当前保留 NoteRepository 抽象，浏览器开发模式暂用 localStorage 适配器，后续主线新增 HTTP 适配器。

    tests/
        前端单元测试目录，按 src 模块边界组织。

    server/
        Web 后端最小 HTTP API 和文件仓库读写逻辑。

## 开发命令

    pnpm install
    pnpm dev
    pnpm server
    pnpm test
    pnpm check
    pnpm build

当前前端开发服务器用于浏览器界面调试。后续接入 HTTP NoteRepository 后，浏览器界面会访问 Docker 后端保存笔记：

    pnpm dev

当前后端服务可本地运行：

    pnpm server

## 许可证

    GPL-3.0-or-later
