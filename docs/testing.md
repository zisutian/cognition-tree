# 测试指南

测试按事实的所有者分层，选择能证明实际行为的最小范围。用例数量和覆盖率百分比不作为验收目标。

## 分层与夹具

| 层次 | 证明的事实 | 入口 |
|---|---|---|
| 单元 | 单个所有者的领域规则、状态机、协议、呈现语义；按生产层次继续分类 | `tests/unit/{core,application,contracts,infrastructure,presentation}` |
| 存储和服务集成 | 实际磁盘内容、CAS、写入租约、权限、进程恢复 | `tests/integration` |
| 结构检查 | 唯一归属、公开入口、依赖图、样式所有权 | `tests/architecture` |
| 文档检查 | 本地链接、锚点、脚本及命令入口 | `tests/documentation` |
| 浏览器流程 | 点击、键盘、焦点、导航、保存、冲突、认证 | `e2e/flows/*.pw.ts` |
| 浏览器布局 | 实际宽高、对齐、滚动、遮挡与长内容 | `e2e/layout/workbench-layout.pw.ts`、`e2e/layout/workbench-appearance.pw.ts` |
| 容量 | 同配置的时间、内存、分析复用与数据完整性 | `tooling/benchmark/workspaceCapacity.ts` |

共同夹具放在 `tests/support`，领域与呈现夹具在其中按所有者分类。只供一个集成测试族使用的 HTTP 服务、文件系统工厂和子进程入口与该测试族放在一起；`e2e/support` 统一拥有浏览器服务、造数、选择器和响应门控。测试文件不充当其他测试的夹具入口。

分类看验证边界：使用真实磁盘、HTTP、子进程或组合多个实际适配器的测试归集成；使用内存端口验证一个状态机的测试归单元。生产模块的依赖规则继续约束单元与共享夹具，集成测试允许在自身组合根连接实际模块。

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

按层运行：

    pnpm test:unit
    pnpm test:integration
    pnpm test:architecture
    pnpm test:docs
    pnpm test:e2e:flows
    pnpm test:e2e:layout

`pnpm test` 发现 `tests` 下全部单元、集成、结构及文档测试；`pnpm test:e2e` 发现 `e2e` 下全部流程与布局测试。分类入口只用于缩小反馈范围，不替代完整入口。

设置状态与导航：

    pnpm test tests/unit/presentation/activities/settings tests/unit/presentation/shell/workbench tests/unit/application/agent/agentConfigurationController.test.ts
    pnpm exec playwright test e2e/flows/workbench-settings.pw.ts e2e/flows/workbench-settings-drafts.pw.ts

Dark Modern 样板、控件与问题面板：

    pnpm exec playwright test e2e/layout/workbench-appearance.pw.ts e2e/flows/workbench-controls.pw.ts

迁移与桌面布局：

    pnpm exec playwright test e2e/flows/workbench-migration.pw.ts e2e/layout/workbench-layout.pw.ts

内置日记和代办的保存回归在真实服务上制造冲突，验证继续编辑、恢复基线后自动同步，
以及延迟冲突解决响应时编辑器、目录和语法控件共同禁用、完成后恢复。

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
另需在独立临时源码副本中验证开发 `./start.sh` 的健康、网页和内容调用，再通过 `pnpm release:smoke <候选目录>` 验证编译入口。两个启动脚本均不接受模式参数；验收不启动正式数据目录，也不替换可用版。
Vitest 默认限制为 2 个 worker，避免多个真实文件系统和子进程测试争抢资源；可用 `--maxWorkers` 显式调整并记录。保留原有超时与断言，不通过重试掩盖失败。
E2E 并发数可用 `CTN_E2E_WORKERS` 调整；同一结果应记录采用的配置。

容量对照在修改前后各运行一次相同命令，保留输出中的 dataset、timings、memory、verification 和 validationCounts。
若修改了容量参数或同时运行其他重负载任务，不能把结果作为同配置的性能对照。时间和内存会受环境波动影响，复用次数和内容完整性需分别判断。

当前桌面验收使用 Chromium 默认 1280×720，保留独立滚动、长内容、侧栏调整及八活动导航。其他尺寸、浏览器和设备不属于本轮扩展范围。历史验收报告只在项目外层的本地 reports 中补充，不是测试前置条件。进程终止恢复只证明进程恢复；真实断电、真实模型和其他平台分别记录。

## 本机内容接口回归

`tests/unit/application/content` 验证名称、Unicode、相对路径及歧义规则；
`tests/integration/server/operations` 使用真实临时仓库验证精确修改、身份、版本、收据及进程中断；
`tests/integration/server/api/localContentApi.test.ts` 与 `tests/integration/tooling/cli` 验证 registry 契约、实际 HTTP 传输和不重放行为。
本机 API 回归包括同内容仓库名称复用、无语法的唯一原文编辑、分页期间版本变化，以及标准输入复用查询 basis。
收据使用真实磁盘验证累计超过单文件容量、旧账本可重入迁移、提交前核对信息和提交前后子进程终止；浏览器仓库管理同样覆盖目录版本冲突。
账本准备失败不得放行新内容提交；仓库提交后的目录读取失败必须保留已提交结果。存储测试验证磁盘和重新打开账本，浏览器测试验证已提交对象仍可见、版本缺失时阻止新写入，以及刷新目录后恢复操作，不用静态 HTML 断言替代恢复流程。
`tests/unit/contracts/openApi.test.ts` 检查完整与内容专用契约的引用可解析性，并展开代表性 schema 与 registry 对照，包括递归树与错误收据，避免通过精简丢失约束。
旧令牌测试已转为认证退出和历史状态保留测试，不以替身继续模拟已移除的认证能力。
浏览器设置回归包含本机 API 收据查询，查询不构成配置修改。既有所有者密钥、Agent 登录、编辑器、迁移和保存冲突仍保留原有验证边界。

## 独立运行包验收

    pnpm test tests/integration/tooling/runtime

覆盖双入口参数拒绝、开发配置保留、进程重启与退出、运行文件与权限校验、越界链接、
监听冲突、未知文件保护、完整备份和安装进程中断恢复。文件系统与进程恢复使用真实临时目录。
此外，构建后的完整运行包必须在不依赖源码目录、Vite、TypeScript 或 pnpm 的环境中验证
网页、API、CLI 与 Agent 子进程入口。`release:smoke` 通过实际 CLI 完成目录读取、创建、局部编辑、重复请求和结果查询，同时验证旧 Bearer 拒绝。启动冒烟使用独立临时数据；不复制正式凭据。打包、校验及发布命令的顺序见[部署与恢复](deployment.md)。
