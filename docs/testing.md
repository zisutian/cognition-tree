# 测试指南

测试按事实的所有者分层，选择能证明实际行为的最小范围。用例数量和覆盖率百分比不作为验收目标。

## 分层与夹具

| 层次 | 证明的事实 | 入口 |
|---|---|---|
| 领域与状态机 | 内容语义、版本、合并、草稿代次、失败和并发结果 | `tests/core`、`tests/application`、`tests/presentation` |
| 存储和服务集成 | 实际磁盘内容、CAS、写入租约、权限、进程恢复 | `tests/infrastructure` |
| 结构检查 | 唯一归属、公开入口、依赖图、样式所有权 | `tests/architecture`、`tests/presentation/designContract.test.ts` |
| 文档检查 | 本地链接、锚点、脚本及命令入口 | `tests/documentation` |
| 浏览器流程 | 点击、键盘、焦点、导航、保存、冲突、认证 | `e2e/workbench-*.pw.ts` |
| 浏览器布局 | 实际宽高、对齐、滚动、遮挡与长内容 | `e2e/workbench-layout.pw.ts`、`e2e/workbench-appearance.pw.ts` |
| 容量 | 同配置的时间、内存、分析复用与数据完整性 | `tooling/benchmark/workspaceCapacity.ts` |

纯规则直接测试输入输出。SSR 只保留有独立意义的可访问输出或内容脱敏契约，不用静态 HTML 证明点击、焦点或滚动。
设计检查保留完整主题词汇、运行尺寸与样式所有权，实际布局由 Chromium 测量，不锁定偶然 CSS 段落或类名拼接。

浏览器每个 worker 拥有独立服务、随机端口和临时目录，每个用例重新造数。
真实文件系统、迁移中断重启、内容冲突、写入租约和 Agent exact CAS 不替换为内存假象。
模型夹具只提供确定性模型协议，配置、HTTP、存储、审批和提交继续使用真实路径；夹具生成的 ID 必须保持唯一。
这证明应用协议流程，不代表真实模型服务通过验证。

异步测试等待可见状态、响应或几何稳定，不使用固定暂停。`responseGates` 只延迟一次真实响应，用于制造请求交错；
即使断言失败，fixture 也会释放响应并解除路由。服务、请求上下文、事件流、计时器及临时目录由其创建者清理。

凭据流程关闭 Playwright trace 和截图。自动页面错误快照也被关闭，因为它可能包含一次性密钥。
敏感断言只输出布尔结果或节点数量，不能把 secret 写入断言消息、日志、截图或持久化测试附件。
布局截图只使用不含秘密的测试数据。

## 针对性验证

设置状态与导航：

    pnpm test tests/presentation/activities/settings tests/presentation/shell/workbench tests/application/agent/agentConfigurationController.test.ts
    pnpm exec playwright test e2e/workbench-settings.pw.ts e2e/workbench-settings-drafts.pw.ts

Dark Modern 样板、控件与问题面板：

    pnpm exec playwright test e2e/workbench-appearance.pw.ts

迁移与桌面布局：

    pnpm exec playwright test e2e/workbench-migration.pw.ts e2e/workbench-layout.pw.ts

修改共享 UI 后运行现有调用方的浏览器流程。保留笔记、日记、代办的输入法、撤销重做、选择区、保存前 flush 和冲突后继续编辑回归。
不要因为样式重构而删除这些业务证明。

## 完整验收

首次准备浏览器：

    pnpm test:e2e:install

依次运行：

    pnpm check
    pnpm test
    pnpm test:architecture
    pnpm build
    pnpm test:e2e
    pnpm benchmark:capacity
    git diff --check

`build` 包含前端构建、包体积门槛与服务端编译。保留现有门槛，不为本轮界面修改放宽限制。
另需用临时数据分别验证 `pnpm dev` 和 `pnpm server:start` 的健康、网页和 API；可用目录的 `./start.sh` 负责生产迁移后的受控重启。
E2E 并发数可用 `CTN_E2E_WORKERS` 调整；同一结果应记录采用的配置。

容量对照在修改前后各运行一次相同命令，保留输出中的 dataset、timings、memory、verification 和 validationCounts。
若修改了容量参数或同时运行其他重负载任务，不能把结果作为同配置的性能对照。时间和内存会受环境波动影响，复用次数和内容完整性需分别判断。

早期验收见[UI 优化记录](ui-optimization-progress.md)，本轮样板和验证状态见[Dark Modern 样板记录](ui-appearance-progress.md)。进程终止恢复仅是进程恢复证据；真实断电、真实模型、其他浏览器和平台的状态分别记录。

## 独立运行包验收

    pnpm test tests/tooling/runtime

覆盖双入口参数拒绝、开发配置保留、进程重启与退出、运行文件与权限校验、越界链接、
监听冲突、未知文件保护、完整备份和安装进程中断恢复。文件系统与进程恢复使用真实临时目录。
此外，构建后的完整运行包必须在不依赖源码目录、Vite、TypeScript 或 pnpm 的环境中验证
网页、API、CLI 与 Agent 子进程入口。启动冒烟使用独立临时数据；不复制正式凭据。
