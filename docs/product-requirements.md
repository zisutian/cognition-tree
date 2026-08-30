# 产品需求

本文件只定义用户可见能力、安全承诺与明确不支持的范围。源码所有权和数据流见
[架构边界](architecture.md)，CTN 编译与分析语义见
[CTN 分析流水线](ctn-analysis-pipeline.md)，排布与视觉见
[界面规范](ui-guidelines.md)，运行步骤见[使用与部署](getting-started.md)。


## 1. 定位

认知树是 Server-backed 的可配置语法结构化笔记系统。`.ctn` 原文、缩进层级、语法规则和引用关系是核心；Markdown、HTML、PDF 与纯文本属于导出方向。

产品面向单个使用者及其受控设备，不引入用户、角色、共享权限或多人协作状态。


## 2. 平级内容领域

Workspace：

    零个或多个普通笔记库。每个仓库独立保存笔记、目录和多份语法，并固定存储在服务端本地文件系统或容器持久卷中。

Journal：

    全局唯一的日记库。日记手动创建，一天可多条；标题固定为 YYYY-MM-DD-0001 形式的当日递增序号，不能重命名。每天最多 9999 条，删除后不复用序号。
    编辑器只显示正文。顶格无符号行是中性 body，不使用普通笔记的概念强调。

Todo：

    全局唯一的代办库。每个有序事项集合是一篇 CTN，集合名是内部固定标题，编辑器只显示正文。
    todo-item 默认符号为 []，缩进表示父子关系。勾选不会把正文改写成 [x]；父子独立完成，完成项保持原位置并划线。
    集合可以新建、重命名、删除和排序；任务结构只允许勾选和正文定位，不提供任务拖动。
    任务可按每 N 天、每 N 周的 ISO 星期集合或每 N 月的日期重复；月内缺失日期收敛到最后一天。周期使用运行环境本地日历日期，不保存时区或重置时间。
    周期任务始终对应同一个稳定 block，不生成正文副本。错过的发生次数计入总数但不形成积压；勾选只作用于最近一次已到期 occurrence，下一期到达后自动投影为未完成。
    修改或停止规则从下一本地日期开始新阶段，历史阶段和完成统计保留。普通已完成任务首次启用周期时把当天记录为完成。

三个内容领域不继承统一文档库模型。Journal 与 Todo 不随普通仓库切换，也不能创建第二份、删除、重命名或切换为普通仓库。


## 3. Workspace 对象

笔记：

    canonical source 包含标题和块元数据；Local 可见 .ctn 文件只保存编辑器正文，文件名去掉扩展名后就是标题。笔记标题在编辑器中使用加粗字重。

文件夹：

    仓库内的组织节点，对应 Local 真实目录，用于归类、移动和新建落点。

块：

    一行及其缩进子树，是选择、移动、引用和结构整理的基本单位。配置语法后，块拥有稳定 ID、创建时间和修改时间；这些元数据不占用编辑区。
    multiline 块完整显示并编辑 opener、正文和 closer 源码，不转换为卡片或受保护范围。精确 lexical 范围、着色和结构移动语义由 CTN 分析流水线定义。

引用：

    普通 Workspace 支持局部块引用和全局笔记引用。重复标题形成 ambiguous 候选，不任意选择目标；自引用保留。
    Journal 的 [[YYYY-MM-DD-0001]] 指向仓内条目；[[仓库名:笔记名]] 只指向命名普通仓库中的整篇笔记。仓库或笔记重命名不自动改写 Journal 原文。


## 4. 语法

普通仓库保存有序语法目录。打开语法与启用语法是两个独立操作；新建语法复制当前编辑文件，但不自动启用。无效草稿必须修复或撤销后才能离开。

普通仓库没有语法文件或没有启用项时，笔记正文以 raw 模式显示，结构、分析和
语法预览不套用默认 profile。空目录中新建语法使用明确的初始模板并保持未启用，
用户仍需执行“用”操作建立 canonical syntax。

语法 Activity 的“系统语法”固定包含日记和代办：

    日记允许配置正文、块和受保护引用规则。
    代办的 todo-item 固定名称“代办”、符号 []、line 类型和 semanticId，只允许配置背景和内容颜色。
    两者都不在编辑器、语法表格或预览中展示可配置的标题规则。

行内颜色、背景 tone 与 owner policy 的精确语义由 CTN 分析流水线定义；产品要求草稿预览、保存后的语法和编辑器显示一致。owner policy 保护的规则不能删除或修改固定字段，普通自定义规则保持完整编辑和删除能力。

普通笔记可以配置标题规则。启用语法与全仓块元数据 reconcile 必须作为一次原子 repository mutation。


## 5. 名称

普通笔记标题、文件夹名、仓库名和 Todo 集合名使用统一可移植规则：

    写入前执行 trim、NFC 和连续 ASCII 空格折叠。
    只允许 Unicode 字母、组合标记、数字、内部普通空格、连字符和下划线。
    唯一键执行 NFKC 和 en-US lowercase。

新建与重命名立即拒绝非法名称。“日记”和“代办”是仓库保留名。既有不合规名称保持可读并形成诊断，必须手工重命名，不自动改写。语法名称和任务正文不使用该规则。


## 6. Repository 与存储

Repository 只负责普通仓库 catalog、内置数据 descriptor、位置、故障、恢复与危险运维，不承担内容编辑。健康活动仓库的文件重扫只从笔记工作区进入；具体区域和操作位置由界面规范定义。

本地可见目录与 `.ctn` 文件是用户可直接管理的权威工作树；非 `.ctn` 文件不进入认知树，也不会被改写或删除。普通仓库必须位于服务端配置的内容根目录；浏览器或 API 可从局域网访问，但不改变存储权威。内部元数据、事务与版本格式由架构边界定义。

Workspace、Journal 与 Todo 的存储及页面状态彼此隔离；一个领域的故障或重置不能影响另一个。无法识别、部分写入或损坏的内容一律关闭写入并显示可重试故障，不得自动清空或伪装为空内容。

页面内编辑先形成内存 draft，再异步同步到 Server。非重叠并发修改可以自动合并，
重叠修改必须进入显式冲突；任何远端结果都不能覆盖尚未处理的本地修改。刷新或关闭
页面不会恢复尚未同步的 draft、队列或冲突；Server 不可用时必须显示失败与重试，
不能创建本地空仓库。精确 CAS、三方合并和请求期间继续编辑的算法由架构边界定义。


## 7. Activities 与 Problems

工作台提供笔记、日记、代办、语法、智能体、搜索、仓库和设置八项顶层能力。智能体不依赖健康普通仓库，profile 不可用时仍显示原因；入口分组和顺序由界面规范定义。

笔记内部提供“编辑、结构、图谱”三个模式，往返切换不改变当前笔记或编辑历史。
重新扫描复用当前 Workspace session 的 reload，执行期间禁用相关修改入口，失败进入 Problems。

Problems 在全部 Activity（包括 Settings）全局展示领域 diagnostics、状态型故障与运行期
操作错误，并支持来源、严重度和可重试性筛选。重复操作错误聚合显示，页面刷新后清空；
状态型 diagnostics 只能随源状态恢复而消失，操作错误可独立关闭。

问题行只导航到内容、来源 Activity、Agent 会话或仓库详情，不执行破坏性操作或自动
重放 mutation。稳定保存不产生成功提示；非稳定状态与短暂操作反馈只进入工作台底栏，
不使用通知浮层。聚合键、容量和反馈生命周期由架构边界定义，视觉与交互由界面规范定义。


## 8. Agent

Agent 是 owner 控制的内容修改入口。新会话使用设置中保存的默认 profile，用户只选择
不可扩大的硬范围，不能在会话中切换 profile。模型变更必须先形成只读、单 store 的
proposal 和人类可审查 diff，再由 owner 整批批准或拒绝；删除还需独立确认。界面不展示
raw chain-of-thought，也不允许提交 model、URL、凭据或安全参数。具体三栏排布与技术详情
展示由界面规范定义。

会话创建时只能选择一种领域范围：

    Workspace：repository、稳定 folder ID 及其后代，或精确 note ID。
    Journal：全域或一组精确 entry ID。
    Todo：全域或一组精确 collection ID。

范围之后不可扩大。folder 后代按稳定 ID 解析；范围根被删除后会话变为
unavailable。发送、批准和 destructive confirmation 前，客户端必须先把该范围
对应的已加载 draft 同步到 Server；offline、conflict、校验或同步失败会阻止
Agent 操作。

proposal 只读且只属于一个 Workspace repository、Journal 或 Todo store，只能整批批准
或拒绝；包含删除时，批准后还需独立二次确认。任意 revision 变化都会使 proposal 失效，
不得自动 retry、merge 或 rebase；跨 store 任务必须按顺序形成多份 proposal。审查内容
必须由领域事实确定性生成，不能由界面重新解析正文或使用模型摘要代替真实 diff。

模型只获得当前 scope 内的读取、搜索、语法说明、proposal 和领域业务动作。多个调用、
未知工具或无效参数必须零执行；工具协议与结果不能伪装成聊天消息。创建或替换 CTN
正文前必须读取当前 store 的写作语法，语法不可用或 fingerprint 变化时必须重新读取后
才能 staging。精确工具契约、纠错循环与符合性流程由架构边界定义。

Agent 对话、压缩摘要和会话只驻留服务内存。服务重启、1 小时 idle TTL、24 小时
absolute TTL 或主动删除都会丢失会话。operation ledger 只记录必要的身份、版本、目标、
结果与时间，不记录提示词、模型回复、正文、完整 diff 或 tool output。

Provider、Profile、模型参数与凭据只由应用内设置管理。发现、探测和符合性检查都是
显式、可观察的操作，不自动联网、创建、选模或 fallback；符合性检查可查询、可取消，
不以一个长 HTTP 请求维持。会话固定创建时的有效配置，resident session 会阻止危险
删除或凭据变更。“会话历史预算（字符）”只控制内存对话压缩，不代表 token 上限，
也不修改 Ollama `num_ctx`；探测结果只读且不改变 Profile。具体操作见使用与部署。

Provider 认证是严格 union：`none`、API Key 或 Codex 专属 ChatGPT 设备码；同一
Provider 只激活一种。API Key 与 Codex 托管登录态属于独立凭据分区，配置只保存引用，
公开响应永不回传 secret。认证清除只有专用 owner 操作；resident session 或 pending
设备码登录会阻止切换、清除、删除和数据迁移。失败、取消、过期和冲突不得留下已启用凭据。

chat runtime 必须区分 reasoning、最终正文、工具调用和终止原因；原始 reasoning 只在
当前工具循环内存中维持连续性，不进入界面、SSE、日志、持久状态或审计。无正文、非法
工具调用、长度耗尽、过滤、空 completion 或缺失终止帧都必须明确失败，零执行、零隐藏
重试且不 fallback。推理强度由用户显式选择，不能保存 Provider 无法应用的伪设置。


## 9. 服务设置与数据迁移

网页、API、开发 HMR 与生产静态资源必须由同一个 Node origin 提供。用户不能通过
环境变量或客户端 JSON 配置监听、端口、路径、owner token、审计容量或 Provider
私网目标；这些事实只能从“设置 → 服务”或“设置 → 智能体”修改。

首次服务只监听 `127.0.0.1:3001`。局域网模式必须已有 owner credential 与 HTTPS
public origin，TLS 由外部代理终止。远程浏览器通过 owner secret 建立 HttpOnly
session；本机 owner 同时检查 socket 与 Host。显式错误 Bearer 永远 401。
owner credential 创建和轮换必须先 prepare pending secret，再由所有者确认保存并以
prepare 返回的 revision、rotation id 和 secret proof exact-CAS activate；prepare 不撤销
旧凭据，activate 在同一权威 candidate 上验证 proof、递增 credential version 并签发新
session，错误或提交结果未知时界面不得清除已交付 secret。普通登录的 secret 校验与
session 签发也必须原子读取同一 credential state。LAN 只承认 active，clear 同时清除
active 与 pending。

数据根迁移前同步所有已加载内容，并在 resident Agent session、pending Codex 登录、
配置冲突或另一迁移存在时拒绝。迁移只复制当前权威分区，拒绝路径重叠和符号链接，
逐文件校验后最后切换 bootstrap 指针。失败继续使用源，成功重启服务，旧根作为人工
备份保留。


## 10. 当前边界

搜索覆盖所有普通仓库、日记和代办；工作台只按“本地仓库 / 日记 / 代办”三个领域范围筛选，不提供逐仓库或更新时间条件。公开搜索请求仍可用 repositoryIds 限制普通仓库范围，供授权和 Agent 等非页面调用方使用。结果以稳定资源与块身份导航；单个来源故障不阻断其他来源，分页游标失效时要求使用当前条件重新搜索。

Todo 不包含截止日期、优先级、备注、筛选或跨集合任务移动。Journal 跨仓引用不进入
普通仓库引用图谱。唯一 HTTP 契约是 `/api/v3`；外部 automation 只有
Workspace、Journal、Todo 只读能力，没有 command、preview、commit、write 或 delete
接口。trusted-client 可经与浏览器相同的 merge-aware snapshot sync 修改全部内容，
但不能访问 Agent、管理或认证；根 `./ctn` 是该能力的参考客户端。真正重叠的变更仍需
调用方或用户决策，不提供 force 或 fallback。Agent 继续只由 owner 审批并执行 exact
CAS。本项目不提供外部 MCP、专用手机契约、Dockerfile、镜像或 Compose；只保留未来
容器路径约定。
