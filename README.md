# 认知树

认知树是一款 Server-backed 的可配置语法结构化笔记应用。它以 `.ctn` 原文、缩进、
语法规则和引用关系组织知识，并把普通笔记库、全局日记、全局代办与受审查的智能体工作流
放进同一个桌面工作台。

## 主要能力

- Workspace：管理零个或多个普通笔记库，支持目录、编辑、结构整理、引用导航与图谱。
- Journal：独立于普通仓库的全局日记，支持一天多条记录及跨仓引用。
- Todo：独立于普通仓库的全局代办，以 CTN 层级表达任务、周期与完成历史。
- CTN：支持仓库级语法、结构化编辑、诊断与跨笔记结构操作。
- Repository：创建、切换、重命名、重新扫描和安全删除本地仓库。
- Agent：在限定资源范围内生成 Proposal，由 owner 审阅 diff 后再提交。
- Problems：统一呈现诊断、运行故障与结构化操作错误。

没有健康的普通仓库时，日记、代办、仓库和设置仍可使用；普通内容活动会提供创建仓库入口。

## 快速开始

要求 Node.js 22.18.0 或更高版本、pnpm 11.1.3 与 Git。Ollama、Codex 或其他模型服务
是可选的独立运行时，不是启动前置条件。

    ./start.sh

默认地址：`http://127.0.0.1:3001`。

生产构建使用：

    pnpm build
    ./start.sh --production

安装、验证、外部可信客户端、服务公开、数据迁移与容器持久化路径约定统一见
[部署与恢复](docs/deployment.md)。

## 关键边界

- Server 拥有内容与持久配置；浏览器只持有当前页面会话状态和少量明确的本地偏好。
- Workspace、Journal 与 Todo 各有独立 contract、session 和存储边界，但共享同步基础设施。
- 官方浏览器和 trusted-client 使用 merge-aware sync；Agent Proposal 经 owner 审批后执行 exact CAS。
- Ollama 与远程模型服务保持外部；Codex 使用项目锁定的隔离 app-server 子进程和应用
  管理的专用认证目录，不读取个人 Codex 配置或会话。
- UI 只通过 application 用例进入领域；wire 形态由 `contracts/` 统一拥有。

源码职责见[模块边界](docs/architecture.md)，保存语义见[内容一致性](docs/content-consistency.md)，协议和进程见[服务运行](docs/service-runtime.md)。

## 源码层次

    core/             CTN、命名以及互不依赖的 Workspace、Journal、Todo 纯领域
    application/      用例、端口、versioned session，以及 Workbench/Agent/System 边界
    infrastructure/   client memory/HTTP adapter、versioned persistence 与 Node server
    presentation/     React shell、Activities、CodeMirror 和共享 UI
    contracts/        API registry、领域 contract 与 wire 解析
    tooling/          CLI、构建、Git、基准脚本与专用 TypeScript 配置
    docs/             文档索引以及产品、架构、工程、使用与界面约定
    tests/            单元、UI、contract 与架构测试
    e2e/              浏览器流程测试

## 文档导航

- [文档索引与事实所有权](docs/README.md)
- [产品需求](docs/product-requirements.md)
- [架构边界](docs/architecture.md)
- [界面规范](docs/ui-guidelines.md)
- [CTN 分析流水线](docs/ctn-analysis-pipeline.md)
- [工程原则](docs/engineering-principles.md)
- [快速入门](docs/getting-started.md)
- [设置操作](docs/settings.md)
- [部署与恢复](docs/deployment.md)
- [测试指南](docs/testing.md)
