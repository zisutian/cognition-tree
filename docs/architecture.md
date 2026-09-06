# 模块边界

本文件拥有源码职责、公开入口、依赖方向与组合根。保存、合并和领域格式见
[内容一致性](content-consistency.md)，协议、持久化与进程生命周期见
[服务运行](service-runtime.md)。界面交互见[界面规范](ui-guidelines.md)。

## 领域

    Workspace：零个或多个普通笔记库。
    Journal：全局唯一的日记库。
    Todo：全局唯一的代办库。

三个内容领域互不直接依赖，也不继承统一文档库模型。它们只共享 CTN、可移植名称和值无关的 versioned persistence。Repository 不是内容领域，只管理普通 catalog、内置数据 descriptor、位置、故障和运维。


## 源码层次

core/

    纯领域代码。core/ctn 提供解析、metadata reconcile、引用与 syntax schema/compiler；core/naming 提供名称值和唯一键；core/workspace、journal、todo 分别拥有自己的内容、命令、查询与 transition。

application/

    框架无关的用例、端口、session controller、read model 和问题投影。application/persistence 持有通用 VersionedRepository、保存队列和 VersionedSessionController；application/syntax 独占 UI-neutral 的 syntax draft projection，包括选项、约束、稳定 field ID、focus target 与诊断位置。跨内容领域协调集中于 application/workbench 的工作台流程和 application/agentHost 的服务端 Agent 工具流程。application/agent 拥有中立会话、硬范围与提案模型以及客户端状态；application/agentHost 拥有服务端会话生命周期、暂存、审批、exact CAS、Provider 登录、符合性检查和探测用例。application/system 只拥有启动配置用例、端口和状态机，不感知内容领域。

infrastructure/

    client 侧内存 cache、HTTP/SSE 适配、Node server、本地 working-tree repository，
    以及 Agent profile、模型 adapter、Codex 子进程、私有 IPC、内存会话和
    operation ledger。CAS 与保存队列策略属于 application，平台层只实现端口；
    client 不直接导入任何 Server 实现。Node 是开发与生产的唯一 HTTP composition
    root；浏览器与 API 同源，客户端只使用相对 `/api/v4`，不存在独立启动配置或
    客户端 owner token。同端口、同进程只是运行与部署事实，不授予前端调用服务端
    内部模块的能力。

presentation/

    React bindings、认证门与工作台组合根、Activity Controller/View、CodeMirror 与共享 UI。React hooks 只存在于这一层。Syntax 编辑视图只消费 application/syntax 的 draft projection 并映射 React 交互，不重新定义选项、约束、field ID、focus target 或诊断位置；core/ctn/syntax 仍只提供 syntax schema/compiler，不制造 React/view contract。非视图 draft persistence 或分析 adapter 可为实际领域行为依赖 core syntax 接口，但不得成为第二个展示投影 owner。

contracts/

    前后端中立的 wire 类型和运行时解析。contracts/api registry 是 HTTP
    路径、方法、body schema、operationId 与 scope 的唯一 owner；领域
    contract 仍按 common、agent、workspace、journal、todo、built-ins 分开。
    contracts/agent 独占 Agent tool、scope、session、proposal、event 与 IPC wire
    schema，但不承载 mutation；API operation catalog 按 foundation、content、
    auth、sync、agent、admin 分区，不存在第二个单体 schema catalog。

tooling 不属于运行时源码层，只持有工程脚本和专用配置。tests 与 e2e 验证边界，
但生产层不得反向依赖它们。可重建产物只写入 .artifacts。


## 依赖规则

    core 不依赖任何外层；Workspace、Journal、Todo 互不直接依赖。
    application 只依赖 core 和自身端口，不依赖 React、contracts、infrastructure 或 presentation。
    infrastructure 依赖 core、application 端口、contracts 与平台 API。
    presentation 可消费 core、application 和基础设施组合入口，但不被其它层反向引用。
    contracts 只复用纯 contract 基础或单一所有者的纯值约束。

补充约束：

    presentation/activities 不依赖 presentation/shell。
    application/workbench 与 application/agent 互不导入；领域不得依赖 Agent。
    infrastructure/client 内部依赖方向固定为：platform 只依赖 platform；repository
    只依赖 repository；http 只依赖 http；runtime 作为组合根可依赖
    runtime、http、platform 与 repository。
    presentation 与其它浏览器侧源码不得导入 infrastructure/server；所有后端能力
    必须通过 infrastructure/client 的 HTTP/SSE adapter 调用 registry 声明的公开
    `/api/v4` 契约。是否同源、同端口或同一进程不改变该边界。
    Workspace 本地 repository 实现只依赖 repository 与 persistence 基础设施。
    相对 import 使用显式扩展名，直接 Node 入口与编译后入口使用同一模块边界。

每个稳定模块有公开入口，跨模块只导入其公开入口；可执行根不作为库被其它模块导入。
`tests/architecture/moduleRegistry.ts` 登记模块职责、公开文件和允许依赖。检查同时验证
生产文件与模块依赖图，包含类型导入、重导出与动态导入，并对照真实文件系统核对
源码和资源的唯一归属。解析失败、非字面量动态导入、未解析的相对路径、遗漏文件、
重复归属、空扫描范围、内部路径越界和依赖循环都会失败；没有临时边界豁免。
工程工具也进入模块检查，CLI 仅通过 Contracts 访问 API。


## Application 协调

每个内容领域拥有独立 session 和状态，但统一复用 application/persistence 的
VersionedSessionController 与保存队列。Session controller 负责页面内 ready 内容、
并发 reload、discard 失败恢复、乐观 draft、dispose 和删除前冻结/恢复；保存队列负责
debounce、本地 stage 与远端 sync/retry 的调度；persistence state 来自已接受 snapshot。独立 transition authority
按 local revision 拼接并发返回的 transition chain、丢弃过期分支并在空闲时压缩历史，
保存队列只决定何时接受和发布。冲突详情读取失败与整仓冲突是不同状态，解决动作只消费
完整冲突快照。Workspace、Journal、Todo wrapper 只注入 preparation policy 与领域命令。
普通仓与内置仓 catalog controller 各自拥有 reload generation；并发刷新只允许最新
结果发布，dispose 是不可重启的终态，会使在途刷新和 mutation 的本地安装失效并清除
订阅者；后台启动错误必须已投影到状态且不能逃逸。普通仓 operation 只由公开 snapshot
持有，不设置影子状态；旧生命周期完成不得改写活动仓选择。
Workbench session slot 先完整构造、订阅并启动候选 controller，再原子替换当前
controller；候选准备失败时释放候选并保留旧会话，同一连接描述可直接重试。
跨仓导航只允许当前 requestId 在异步 flush 后执行仓库选择；新请求或 dispose 会撤销
旧请求尚未发生的副作用，在途旧结果不得发布或继续读取已释放的组合对象。
普通仓库切换只排空并替换 Workspace session，不
停止或重建 Journal/Todo。

application/workbench/WorkbenchController 提供 start、dispose、subscribe、
getSnapshot 与明确 facade。snapshot 只包含不可变状态，不嵌入可变 controller；
查询和操作只能经 facade 执行。它组合 RepositoryCatalogController、Workspace
session slot、Journal/Todo built-in slot、SearchIndex、引用解析与跨仓导航
状态机，并独占以下跨领域流程；API Access、Operations、System 与 Agent administration
由 client runtime 组合结果并列交给 Presentation，不经 Workbench 转发：

    普通仓库切换与一次性导航。
    Journal 的 [[仓库名:笔记名]] 解析。
    按需读取命名普通仓库的 session snapshot，只从 canonical note header 建立标题索引。
    排空当前 Workspace、切换仓库、等待新 session，再进入 Notes 并选择目标笔记。
    把三领域 ContentDestination 映射到 Activity、资源和稳定 block ID；目标块
    已消失时只在该边界回退到资源首行并报告结果过期。

Workbench dispose 是不可恢复终态：它终结全部 session slot、搜索、导航和变更事件源，
清空订阅者，并拒绝后续内容 facade 与协调命令；start 与终态订阅不重建内部状态。
Versioned session 与 HTTP 变更事件源同样不得在 dispose 后重新积累 listener。

application/agent 提供 AgentRuntimePort、AgentSessionController、scope policy 与通用
proposal state machine；application/agentHost 通过三个领域公开的 preparation 入口
实现服务端暂存、审批与提交。二者不依赖 contracts、infrastructure、presentation 或
application/workbench；AgentRuntimePort 定义与 Provider 无关的上下文预算耗尽语义。
浏览器的 AgentClientController 只消费 wire-neutral port；
发送、批准和 destructive confirmation 前所需的已加载 draft 同步由
`AuthenticatedWorkbenchRoot` 在 presentation composition root 注入，避免任一应用协调根
反向调用另一个。

一份 proposal 只允许一个 Workspace repository、Journal store 或 Todo store；跨
store 意图必须顺序生成多份 proposal。proposal 是带 UUID、version、SHA-256
digest、base revision、change set、最终 diff、冻结 review 与 destructive 标记的
只读值，只能整批批准或拒绝。各领域 projection 从同一原始 base 与最终 staged
projection 生成资源标题/路径、语义动作、块计数和带有限上下文的行 diff；review
进入 proposal v2 digest，presentation 只渲染它，不重新解析 CTN 或请求模型总结。
Workspace 仓库名称无法解析时 proposal fail closed，不回退显示 repository ID。任意
store revision 变化使其 stale；删除批准后必须再经过独立 destructive confirmation。

application/search/SearchIndex 是三领域资源投影、Unicode 归一化、grapheme
源码偏移、片段、过滤、排序、fault 与 cursor 的唯一 owner。过滤在命中折叠前
执行；缓存按来源 revision 和 corpus key 失效，查询 LRU 有界。presentation
只提交 SearchQuery 和打开 ContentDestination，不解析 CTN、扫描仓库或换算
行号。SearchController 的响应式 state 只保存会影响渲染的查询事实；高频 scrollTop
由独立 viewport cell 持有，切换 Activity 时显式读取，不通过静默替换 state 或每次滚动
发布整个 Workbench snapshot。

Journal 只理解日记内容、仓内引用和外部引用 token；Todo 只理解 CTN collection、任务结构和 completion。跨仓边不进入普通引用图谱，重命名也不跨独立 CAS 改写 Journal。

application/repository/RepositoryCatalogController 独占 catalog 加载、活动仓库持久化、创建/重命名/删除期间的并发保护和 descriptor 复用。Workspace session 只管理生命周期、authoritative state 与保存队列；语法目录的创建、复制命名、启用、删除和 metadata reconcile 由独立 mutation service 计算。

application/agent/AgentClientController 独占客户端 session/status authority；完整 reload
只能由一个循环串行执行，并发 reload、SSE event、单 session recovery 或 mutation 结果
会废弃在途旧列表并要求最后再读一轮，陈旧响应不得覆盖较新 sequence。dispose 是不可
恢复终态：关闭事件流、清空订阅者，拒绝后续端口操作和 Profile 偏好写入；在途响应可以
完成网络请求，但不得再发布客户端状态。
AgentSessionController 的 turn 完成、取消和失败都从未决 proposal 集合恢复 session 状态；
运行时失败不得把待审批或待破坏性确认的 proposal 降格为 idle。
AgentConfigurationController 独占客户端配置快照 authority；load、设备登录和一致性检查的
回读只可安装到未变化的 authority，mutation 响应只可替换其 base revision 或相同 revision，
陈旧读取与延迟响应不得回退已观察到的更新配置。operationStatus 从在途前台操作计数投影，
单个请求结束不得把其他仍在执行的操作误报为 idle。设备登录与一致性检查还分别按
provider/profile 持有最新操作令牌；取消、新操作或配置实体变化会废弃旧轮询，旧
pending/running 回包不得覆盖更新的终态。若服务端在不可中断的 finishing/recording
阶段返回非终态，原轮询仍是
唯一 owner；只有确认终态的取消回包才转移令牌。Provider/Profile 被删除或 digest 变化时，
对应 probe、登录、conformance 派生状态由配置快照 owner 原子裁剪。
SystemConfigurationController 同样独占系统配置快照 authority；显式 load 采用最后请求优先，
管理操作响应只能安装到其启动时的 authority 或相同 revision，旧响应不得回退新的服务配置；
operationStatus 从所有在途管理操作计数投影。
OwnerAuthenticationController 串行执行会改变 owner session cookie 的登录与登出命令；认证读取
等待既有命令排空，并由 mutation/request version 阻止旧结果覆盖新的认证状态。

Application 只声明 scheduler、时钟、ID 与生命周期端口；浏览器 UUID、时间、页面事件和定时器实现由 infrastructure 注入。Problems 的选择与合并留在 application，Activity 切换和 DOM 聚焦只由 presentation 执行。


## 客户端适配边界

    client/platform 只拥有 UUID、时间、调度，以及当前仓库和默认 Agent Profile 的
    localStorage 偏好；
    client/repository 仅拥有内存 catalog/content cache。application/persistence/localFirst
    拥有加载、暂存、远端协调和冲突策略；localFirstRepository 只作为显式组合 façade，独占初始化与 load/sync 请求
    去重；loading 独占 cache-first/remote-refresh 策略、首次安装与显式丢弃重载，staging
    独占 prepared change 延续、冲突态合并和本地 CAS 重试，remoteReconciliation 独占
    远端 snapshot 安装、pending rebase 和并发草稿交接，synchronization 独占提交、后端
    冲突恢复、结果分类与 transition 汇总，conflictResolution 独占 proof、人工偏好、恢复
    覆盖校验和 rebase 后同步。localFirstRepositoryProjection 独占 prepared
    local/remote projection cache、merge-base 复用和 snapshot/transition 投影；各协作者
    只消费 projection port，不导入该具体状态实现。localFirstRepositoryPolicy
    独占远端错误分类、cache fallback、内容等价和冲突单元规范化；client/http 只实现
    /api/v4 transport 与两类 SSE；client/runtime 只负责把
    这些实现注入 application 端口。源码中不存在 IndexedDB 或存储模式分支。
    application/workspace 的 localFirstWorkspaceCatalog 串行投影内存 cache，
    并以远端观察 epoch 拒绝陈旧 list 回写；application/repository 的 cachedBuiltInCatalog
    拥有内置目录的离线回退，client/runtime 组合 HTTP、缓存端口和领域 preparation；cache 始终是离线投影，任何写入或清理失败都不能改写已完成的远端 mutation。
## Presentation 与 Problems

本节只说明 Presentation 所有权与跨层边界；精确布局、交互、尺度和颜色由
[界面规范](ui-guidelines.md) 独占。

`AppRoot` 只拥有 API origin 与 OwnerAuthenticationController，并以认证状态挂载或卸载
`AuthenticatedWorkbenchRoot`。后者为每个认证生命周期创建 Workbench、Agent、System
configuration 与 ProblemCenter，订阅快照并维护当前 Activity；退出登录会终结整组
controller，重新登录不得复用终态实例。领域 session 到 view application 的组合位于
`presentation/shell/application`；Activity descriptor catalog 是 ID、标签、图标、分组与
懒加载元数据的唯一 owner，位于 presentation/shell/workbench。ActivityBar 接收描述
数据；各 Activity 只接收所需接口。共享 UI 不依赖 Activity 或编辑器实现，通用 React hook
通过注入取得 scheduler。Todo 本地日期端口由 application/todo 拥有，平台只实现适配；
初始领域内容由显式内容组合入口创建。

每个 Activity 采用纵向切片：controller、context、view、局部 hook 和样式位于
`presentation/activities/<activity>/`。跨 Activity 的组合只存在于 shell，共享交互
原语只存在于 `presentation/ui`；Activity 只组合领域内容、局部 Presentation 状态和
回调，不复制应用状态或领域命令。

`ToolPanel`、`ToolSection`、`ToolPropertyList`、`ToolToolbar` 和 `ToolList` 分别拥有
工具页面布局、分区、已保存属性、工具栏和结果行，各自样式与组件职责一致；普通控件、
详情壳与 CTN 编辑器分别由 `presentation/ui/shared`、`DetailPanel` 和 CodeMirror adapter
独占。`ActivitySlots` 只声明 context、main 与可选 detail 内容，AppFrame 独占工作台
尺寸、折叠和专注模式。页面不得实现第二套详情壳或跨 Activity 布局状态。

Activity 内部仍按语义拆分独立 view：Repository 的 catalog、状态、恢复与危险操作，
Todo 的集合、编辑与周期结构，以及 Notes 的编辑、结构与图谱不因视觉相似而共享业务
状态。引用图谱 Canvas 只声明 DOM 并接收当前仓库 session 选出的 controller；模拟、位置
缓存、缩放和平移属于专用 hook/controller，controller cache 不得成为模块级全局状态。
核心引用图只包含语义数据；Application 投影以源图对象身份标识一次拓扑，禁止在纯
core 中用全局计数器制造展示缓存 revision。

Agent Presentation 只消费 AgentClientController 的会话快照、连续事件和冻结 proposal
review，不解析正文或生成审批摘要。发送、批准与 destructive confirmation 前的 scope
同步由 `AuthenticatedWorkbenchRoot` 作为组合根注入；事件序列出现缺口时重读 session
snapshot。Provider、Profile、凭据与符合性状态只经 Settings application facade 管理。

SettingsTarget 是页面、对象 ID 与创建状态的唯一选择。对象草稿会话持有基线 revision、
编辑代次、提交状态与失败原因。Provider/Profile 修改必须提交编辑时的 baseRevision；
刷新后的配置不能借给旧表单。保存回执只更新同一会话，旧回执不清除新编辑；
配置已提交但后续状态刷新失败时，返回已提交快照并单独提示刷新失败。系统分表单
从已校验的完整基线生成请求，运行时版本变化与持久配置冲突分别处理。

Shell 的 workbenchNavigation 是应用内活动导航入口，只接收活动的限制原因和底栏投影；
目标选择、仓库切换、问题定位和展开动作在导航获准后执行。被阻止的导航不排队。
共享表单不判断配置版本或保存政策；凭据与迁移操作各自持有就地确认目标。重连计时器
通过 SystemReconnectPort 注入，页面退出或新编辑取消待执行的重连。

Settings 的页内选择和未提交表单、Search 的查询草稿、Notes 的模式/图谱筛选/图谱设置
以及工作台布局都属于页面会话状态；SearchController 拥有查询草稿，Presentation 拥有设置表单和布局。需要跨仓库保留的状态由显式
repository session store registry 以带值类型的 slot key 分区，React hook 只订阅当前仓库。
registry 位于按仓库重挂载的工作台边界之上、认证边界之内，因此仓库切换保留分区，退出
登录销毁整个页面会话；ready catalog 是有效仓库分区集合的唯一依据，删除仓库后 registry
统一裁剪所有 slot 的对应分区。不得用模块级 Map 建立第二个页面会话 owner，也不得进入领域
content 或服务端配置。write-only secret 随对应表单卸载
而清除；服务端 pending 操作具有独立生命周期，不由页面卸载取消。API access settings 的
列表 authority、load generation、mutation version 与在途计数由独立页面 session controller
持有，React hook 只订阅并在 Activity 卸载时终结 controller；旧 load 不得覆盖
create/revoke，单个完成不得提前清除 loading，dispose 后的迟到结果不得发布。
SettingsStatusPanel 只提供统一 detail shell；SettingsActivitySlots 在设置组合边界中路由当前目标；Agent、System、API access、
Audit 的状态投影分别由各自领域 status view 文件持有，不在路由文件内混合实现。

`application/problems` 的 ProblemCenter 是运行期 operational incident 的唯一 owner。
API、Agent、同步、Settings 与 UI action 只通过 `ProblemReporter` 上报结构化安全信息；
ProblemCenter 负责指纹聚合、最近 requestId、时间、次数、200 项容量和页面生命周期。
dispose 是不可恢复终态：取消 transient、清空订阅者，并拒绝迟到的上报、订阅和计时器
发布；被拒绝的上报返回 null，不分配虚假的 problem id。
领域 diagnostics 继续由源状态派生，不复制进 ProblemCenter。

Presentation shell 在全部 Activity 合并 diagnostics、可恢复状态故障与 operational
incidents；筛选只改变展示。问题导航只能进入拥有恢复能力的 Activity，不能执行 mutation
或盲目重试。五秒 transient feedback 同样由 ProblemCenter 调度，稳定保存不生成文案。

编辑器只接收 editable source、语义角色和展示数据。canonical 页面消费 application 已
准备的 syntax、document 与 parse index；只有未保存 draft 可在 editor adapter 内分析。
缺少已准备 syntax 时使用显式 raw/unavailable 状态，不构造默认语法。CTN parser、
multiline lexical 范围与 decoration 语义由
[CTN 分析流水线](ctn-analysis-pipeline.md)独占，Presentation 不重建。
