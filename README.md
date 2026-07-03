# 认知树

本地优先的可配置语法认知树笔记软件。

认知树不是 Markdown 编辑器，也不是传统富文本笔记。它用 `.ctn` 原文、缩进层级和仓库语法记录概念、定义、组分、自我理解、多行内容和引用关系。

## 当前状态

当前路线：

    浏览器前端 + 本机 Node HTTP 后端 + 本地文件仓库。

已具备能力：

    运行与存储：React / Vite 前端、Node HTTP 后端、本地文件仓库、WorkspaceRepository。
    笔记编辑：CodeMirror 原文编辑、CTN parser、笔记和目录树管理。
    仓库语法：唯一 syntax/workspace.toml、受控语法编辑、前后端 TOML parity tests。
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
    pnpm server
    pnpm dev
    pnpm test
    pnpm check
    pnpm build

默认地址：

    前端：http://127.0.0.1:5173
    后端：http://127.0.0.1:3001

环境变量：

    VITE_CTN_API_BASE_URL=http://127.0.0.1:3001 pnpm dev
    VITE_CTN_STORAGE_MODE=browser pnpm dev

## 代码结构

    src/app/          React 应用入口
    src/features/     blocks、notes、syntax、migration、visualization 功能界面
    src/shell/        应用外壳、活动栏和侧栏
    src/workspace/    model、runtime、session、command、workflow 和 view model
    src/ctn-parser/   CTN 原文解析
    src/ctn-syntax/   语法 profile 与 TOML
    src/editor/       CodeMirror 集成
    src/storage/      前端存储端口和适配器
    src/styles/       全局样式
    server/           Node HTTP API 和文件仓库
    tests/            单元测试
