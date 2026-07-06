# 认知树

本地优先的可配置语法认知树笔记软件。

认知树不是 Markdown 编辑器，也不是传统富文本笔记。它用 `.ctn` 原文、缩进层级和仓库语法记录概念、定义、组分、自我理解、多行内容和引用关系。

## 当前状态

当前路线：

    浏览器前端 + 本机 Node HTTP 后端 + 本地文件仓库。

已具备能力：

    运行与存储：React / Vite 前端、Node HTTP 后端、本地文件仓库、WorkspaceRepository。
    笔记编辑：CodeMirror 原文编辑、CTN parser、笔记和目录树管理。
    仓库语法：syntax/workspace.toml、受控语法编辑、前端 CTN syntax 解析。
    块迁移：跨笔记移动整棵块子树。
    可视化：第一版笔记级引用图谱。

数据文件：

    workspace.json
    notes/*.ctn
    syntax/workspace.toml

第一版限制：

    不处理多用户账号、公网部署、桌面安装包和移动端应用。

## 开发

需要：

    Node.js LTS
    pnpm

常用命令：

    pnpm install
    pnpm hooks:install
    pnpm server
    pnpm dev
    pnpm test
    pnpm check
    pnpm build

提交信息格式：

    type(scope): subject

提交类型：

    feat
    fix
    perf
    refactor
    test
    docs
    chore
    build
    ci

本地提交钩子：

    commit-msg：检查提交信息格式。
    pre-commit：运行 git diff --cached --check、pnpm check 和架构边界测试。

提交前验证：

    pnpm test
    pnpm check
    pnpm build
    git diff --check

后端脚本语法检查：

    node --check server/index.mjs
    node --check server/workspaceApiServer.mjs
    node --check server/workspaceFileStore.mjs
    node --check server/workspaceManifestDto.mjs

默认地址：

    前端：http://127.0.0.1:5173
    后端：http://127.0.0.1:3001

环境变量：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001 pnpm dev
    VITE_CTN_STORAGE_MODE=browser pnpm dev

## 代码结构

    src/app/          应用组合根
    src/application/  session、命令流程、加载保存、状态和端口调用
    src/ui/           shell、activities、shared 用户界面
    src/workspace/    model、commands、queries、indexes、context workspace 业务核心
    src/ctn/          parser、syntax CTN 解析和语法核心
    src/storage/      workspace 数据和 syntax source 读写
    src/editor/       编辑器技术适配
    server/           本地 HTTP API 和文件仓库执行端
    tests/            单元测试和架构边界测试
