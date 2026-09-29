# 模块边界

本文件说明领域划分、源码职责、依赖方向和组合根。内容格式与保存契约见
[内容一致性](content-consistency.md)，协议与进程见[服务运行](service-runtime.md)，
交互见[界面规范](ui-guidelines.md)。

## 领域

| 领域 | 管理对象 | 隔离边界 |
|---|---|---|
| Workspace | 零个或多个普通笔记库 | 每个仓库独立内容与会话 |
| Journal | 全局唯一日记库 | 不随普通仓库切换 |
| Todo | 全局唯一代办库 | 不随普通仓库切换 |

三个领域互不直接依赖，也不继承统一文档库模型；共享 CTN、名称规则和与内容值无关的
版本化持久化能力。Repository 管理目录、存储描述、位置、故障和运维，不是第四个内容领域。
跨领域操作由明确的协调模块组合，不把某个领域变成其他领域的入口。

## 源码层次

| 层次 | 职责 | 主要入口 |
|---|---|---|
| `core` | CTN 编译与分析、命名、三个内容领域的规则和变换 | 各领域公开入口 |
| `application` | 用例、端口、会话、查询投影与跨领域协调 | 各模块公开入口 |
| `infrastructure` | HTTP、存储、时钟、浏览器能力、模型适配与进程 | client/server 组合入口 |
| `presentation` | React 绑定、工作台、Activity、编辑器与交互适配 | shell 组合根及各 Activity |
| `contracts` | 前后端中立的 wire 类型、运行时解码和 API registry | [API registry](../contracts/api/registry.ts)及领域契约 |

`tooling` 持有 CLI、构建、发布、Git 和基准工具；`tests`、`e2e` 验证这些边界。
完整模块登记及允许依赖由[模块注册表](../tests/architecture/moduleRegistry.ts)维护，
本文不重复逐文件清单。构建产物与运行目录见[部署与恢复](deployment.md)。

## 依赖规则

- `core` 不依赖外层，Workspace、Journal、Todo 互不导入。
- `application` 依赖 core 和自身端口，不依赖 React、contracts、infrastructure 或 presentation。
- `infrastructure` 实现 application 端口，可使用 core、contracts 和平台 API。
- `presentation` 消费 core、application 以及显式基础设施组合入口，不被其他层反向引用；React hooks 留在这一层。
- `contracts` 只复用纯契约基础或单一所有者的纯值约束，不承载 mutation。

跨模块通过公开入口连接；可执行入口不作为库被其他模块导入。工程工具同样受模块检查，
CLI 只通过公开 Contracts 构造 API 请求。类型导入、重导出和动态导入均受依赖约束。
相对导入使用显式扩展名，使 Node 源码入口与编译入口保持一致。

项目内还有以下边界：

- `presentation/activities` 不依赖 shell；跨 Activity 组合在 shell 完成。
- `application/workbench` 与 `application/agent` 互不导入，内容领域不依赖 Agent。
- client 的 platform、repository、http 各自保持内部依赖；runtime 负责将它们组合。
  浏览器源码不导入 `infrastructure/server`，仅经 client HTTP/SSE adapter 访问 `/api/v4`。
- Workspace 本地 repository 实现只依赖 repository 与 persistence 基础设施。
- Node 是开发与生产的 HTTP 组合根。浏览器与 API 同源，不改变前后端模块边界。

## Application 协调

| 所有者 | 稳定职责 |
|---|---|
| `application/persistence` | 通用版本仓库、保存队列、内容会话；领域 wrapper 注入 preparation 与命令 |
| `application/sync` | 经端口协调同步、revision 观察、目录删除事件与 checkpoint，不导入具体内容领域 |
| `application/repository` | 普通目录、活动仓库选择、创建/重命名/删除准入与存储描述 |
| `application/workbench` | 内容会话组合、普通仓库切换、跨仓引用与内容导航 |
| `application/content` | 外部内容查询、名称定位、单次提交与操作收据协调 |
| `application/commands`、`application/todo` | CTN 写作指南和命令投影；任务完成与周期投影 |
| `application/syntax` | 与 UI 无关的语法草稿投影、字段约束、焦点目标和诊断位置 |
| `application/search` | 三领域搜索、Unicode 匹配与源码位置、排序、分页及来源故障隔离 |
| `application/agent` | 与 Provider 无关的会话、硬范围、提案模型和运行时端口 |
| `application/agentClient` | 浏览器 Agent 会话与配置控制器 |
| `application/agentConfiguration` | 配置、参数校验、版本、可用性、修改事务与凭据端口 |
| `application/agentHost` | 服务端会话、暂存、审批、提交，以及 Provider 登录、探测与符合性用例 |
| `application/system` | 启动配置、认证及迁移用例和状态机，不感知内容领域 |
| `application/problems` | 运行期操作问题的聚合与生命周期 |

Workbench 的 snapshot 只包含不可变状态，查询与命令通过 facade 提供。
Local API、Operations、System 和 Agent administration 由 client runtime 并列交给
Presentation，不经 Workbench 转发。Agent 与 Workbench 所需的跨协调根同步，由
`AuthenticatedWorkbenchRoot` 注入，避免两个应用协调根反向调用。

普通仓库切换只排空和替换 Workspace session；Journal/Todo 继续运行。候选会话准备成功后
才替换旧会话，准备失败保留旧会话并允许重试。跨仓导航先同步当前内容，再选择目标仓库和页面；
迟到请求不得执行已撤销的选择或导航副作用。`ContentDestination` 统一表达资源与稳定块身份，
目标块消失时由该协调边界回退到资源首行并报告结果过期。

会话、目录及配置控制器各自持有被接受状态；旧读取和延迟 mutation 回包不得回退新状态。
并发操作的状态由全部在途操作投影，单个请求结束不代表整体空闲。dispose 是不可恢复终态：
停止接纳新操作、清理订阅和事件源，迟到结果不能重新发布状态或恢复监听。

搜索使用准备好的领域投影，不由界面解析正文或换算行号；来源故障独立隔离，分页身份包含
来源版本与故障状态。读取与加载共享有界并发，顺序不依赖异步完成先后；缓存依实际版本失效。
缓存实现和默认容量由[搜索模块](../application/search/index.ts)拥有。

## 本机内容用例

`application/content` 通过端口组合目录准入、目标解析、领域 preparation、一次 CAS 和账本。
稳定 ID 查询与名称查询复用领域资源投影；Agent 复用其中立资源类型和领域准备入口，
保留独立的会话、暂存与审批流程。具体函数在服务端组合根接线，不由类型依赖暗中触发行为。

精确文本替换、块与子树范围由 core/ctn 拥有，逻辑目录路径由 core/workspace 拥有。
HTTP 只做 wire 适配，CLI 不实现目录解析、直接文件写入或凭据存储。
调用方式见[API 与 CLI 集成](api-integration.md)，提交语义见[内容一致性](content-consistency.md)，
持久收据见[服务运行](service-runtime.md#操作账本)。

## 客户端适配边界

- `client/platform` 实现时钟、ID、调度和明确的浏览器偏好存储。
- `client/repository` 提供内存 catalog/content cache，不决定保存或冲突政策。
- `client/http` 实现 registry 声明的请求与两类 SSE；`client/runtime` 负责端口接线。
- `application/persistence/localFirst` 拥有加载、暂存、远端协调、同步、冲突解决及其投影。
  接受的 repository snapshot 是内容和持久状态的权威，保存队列只负责调度与顺序安装。
- 普通与内置目录的缓存属于离线投影；缓存失败不能改变已完成的远端提交，旧缓存不能覆盖新目录。

浏览器偏好的完整清单和持久级别见[服务运行](service-runtime.md#状态与存储)。
浏览器和 Node 共用的中立 SSE 分帧属于 `infrastructure/sse`；它不决定业务事件或模型协议。

## Presentation 与 Problems

`AppRoot` 持有认证状态，并挂载 `AuthenticatedWorkbenchRoot`。后者在一次登录生命周期内
组合控制器、ProblemCenter 和页面导航；退出登录销毁整组会话，重新登录创建新实例。
各 Activity 采用纵向切片，组合领域内容、局部页面状态和回调，不另存应用权威状态。

`presentation/navigation` 拥有稳定页面目标、预览/固定页和导航会话；编辑器视图状态由页面会话持有。
仓库相关视图状态按仓库和用途分区，位于 Workspace 绑定之上、认证边界之内；删除仓库统一裁剪，
退出登录统一销毁。核心图谱只含语义数据，模拟、缩放、位置缓存属于展示层会话。

Compact UI 拥有通用控件、工作台分区与交互。认知树通过公开组件表达业务，不复制通用样式或状态。
共享 CTN 内容树只适配领域投影，结构移动在一个入口按稳定 ID 解析当前位置；菜单与拖放复用它。
语法视图只消费 application/syntax 投影；编辑器只消费已准备的正文与语法，未保存草稿的分析例外见
[CTN 分析流水线](ctn-analysis-pipeline.md)。

ProblemCenter 拥有操作错误的指纹聚合、计数、时间与有限容量；领域诊断和状态故障从原状态派生。
应用通过结构化 `ProblemReporter` 上报，界面负责筛选、定位与恢复入口。
聚合不复制领域内容，问题导航不执行 mutation；错误显示和页面隔离见[界面规范](ui-guidelines.md)。
