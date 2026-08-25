# 产品需求


## 1. 定位

认知树是 Server-backed 的可配置语法结构化笔记系统。`.ctn` 原文、缩进层级、语法规则和引用关系是核心；Markdown、HTML、PDF 与纯文本属于导出方向。

产品面向单个使用者及其受控设备，不引入用户、角色、共享权限或多人协作状态。


## 2. 平级内容领域

Workspace：

    零个或多个普通笔记库。每个仓库独立保存笔记、目录、多份语法和工作台偏好，并固定存储在服务端本地文件系统或容器持久卷中。

Journal：

    全局唯一的日记库。日记手动创建，一天可多条；标题固定为 YYYY-MM-DD-0001 形式的当日递增序号，不能重命名。每天最多 9999 条，删除后不复用序号。
    Journal v3 按升序 day bucket 保存不可回退的 lastIssuedSequence；删除最后一篇后保留空 bucket。界面隐藏空 bucket，并按“年 → 月 → 条目”倒序展示，月内按创建时间、序号和稳定 ID 确定性倒序。
    编辑器只显示正文。顶格无符号行是中性 body，不使用普通笔记的概念强调。

Todo：

    全局唯一的代办库。每个有序事项集合是一篇 CTN，集合名是内部固定标题，编辑器只显示正文。
    todo-item 默认符号为 []，缩进表示父子关系。完成状态只保存在 collection completion sidecar，不写成 [x]；父子独立勾选，完成项保持原位置并划线。
    左侧集合列表不显示计数，集合排序使用共享列表的整行拖拽与上方/下方落点。右侧任务结构复用统一结构树，只提供勾选和正文定位，不提供任务拖动。
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
    multiline 块完整显示 opener、正文和 closer 源码，不使用卡片、隐藏范围、保护范围或视觉缩进补偿。整个 lexical 范围继承命中规则的背景和文字颜色；规则名称不作为额外标题插入编辑器。
    multiline 源码使用与其他文本相同的光标、选区、Tab/Shift+Tab、Enter、删除、复制、粘贴及撤销行为。闭合与未闭合状态都可以直接编辑，结构操作则使用解析得到的完整 lexical 范围移动块。

引用：

    普通 Workspace 支持局部块引用和全局笔记引用。重复标题形成 ambiguous 候选，不任意选择目标；自引用保留。
    Journal 的 [[YYYY-MM-DD-0001]] 指向仓内条目；[[仓库名:笔记名]] 只指向命名普通仓库中的整篇笔记。仓库或笔记重命名不自动改写 Journal 原文。


## 4. 语法

普通仓库保存有序语法目录。点击语法文件只打开编辑；只有行内“用”操作改变当前启用项，启用状态由列表前导图标表达。语法名称只在左侧原行重命名，右侧设置不重复名称字段。新建语法复制当前编辑文件并选中，但不自动启用。无效草稿必须修复或撤销后才能离开。

普通仓库没有语法文件或没有启用项时，笔记正文以 raw 模式显示，结构、分析和
语法预览不套用默认 profile。空目录中新建语法使用明确的初始模板并保持未启用，
用户仍需执行“用”操作建立 canonical syntax。

语法 Activity 的“系统语法”固定包含日记和代办：

    日记允许配置正文、块和受保护引用规则。
    代办的 todo-item 固定名称“代办”、符号 []、line 类型和 semanticId，只允许配置背景和内容颜色。
    两者的 synthetic title 只用于内部 canonical 解析，不在编辑器、语法表格或预览中展示为可配置规则。

行内规则只提供一个颜色。该颜色控制成对符号或单个符号以及下划线，行内正文继承所在块的文字颜色，不产生独立字体颜色或背景。

标题、根规则和块规则的背景选择都包含“编辑器背景”，其语义是使用编辑器底色、不叠加语法强调背景。背景修改必须由同一个 tone 同步驱动草稿预览、已编译语法和编辑器行装饰。

owner policy 判定为不可删除的规则不显示删除入口。其固定字段直接显示只读文字，不伪装成禁用输入框或禁用选择器；同一规则中仍可修改的字段继续使用正常控件。普通自定义规则保持完整编辑和删除能力。

普通笔记可以配置标题规则。启用语法与全仓块元数据 reconcile 必须作为一次原子 repository mutation。


## 5. 名称

普通笔记标题、文件夹名、仓库名和 Todo 集合名使用统一可移植规则：

    写入前执行 trim、NFC 和连续 ASCII 空格折叠。
    只允许 Unicode 字母、组合标记、数字、内部普通空格、连字符和下划线。
    唯一键执行 NFKC 和 en-US lowercase。

新建与重命名立即拒绝非法名称。“日记”和“代办”是仓库保留名。既有不合规名称保持可读并形成诊断，必须手工重命名，不自动改写。语法名称和任务正文不使用该规则。


## 6. Repository 与存储

Repository Activity 只负责普通仓库 catalog、内置数据 descriptor、位置、故障和运维：

    左侧依次显示“内置数据”的日记与代办，以及唯一的“本地”分组；本地列表底部只有一个 `+` 新建入口。
    普通仓库行只显示名称和极简状态；当前仓库由前导图标表达，选中后才显示切换与重命名入口。
    右侧显示只读 ID、位置、复制、重扫、重试、冲突恢复和危险操作，不重复显示固定的存储类型。
    日记与代办右侧只显示存储位置、故障、重试和受保护说明。

本地可见目录与 `.ctn` 文件是权威工作树；根部 `.ctn/` 保存身份、顺序、语法、sidecar 和 WAL。非 `.ctn` 文件属于 unmanaged 数据，不投影、不改写、不删除。普通仓库必须位于服务端配置的内容根目录；浏览器或 API 可从局域网访问，但不改变存储权威。

普通 Workspace 只接受 v4，Journal 只接受 v3，Todo 只接受 v4。Journal/Todo 使用彼此隔离的 storage、epoch、draft/cache 和同步队列；一个领域的故障或重置不能影响另一个。旧版、未来版本、部分状态和损坏内容一律关闭写入并显示可重试故障，不执行运行时迁移、自动清空或空内容回退。

页面内保存先以 local revision CAS 写入内存 draft，再异步同步 Server。offline、
conflict 和 sync-error 必须显式显示；远端冲突不能覆盖本地 pending 内容。
刷新或关闭页面不会恢复尚未同步的 draft、队列或冲突，Server 不可用时必须
显示失败与重试，不创建本地空仓库。


## 7. Activities 与 Problems

ActivityBar 主区固定为“笔记、日记、代办、语法”，底部固定为“智能体、搜索、仓库、设置”。Activity 的 ID、名称、图标、分组、懒加载入口和可用条件由同一 descriptor catalog 声明。智能体不依赖健康普通仓库，profile 不可用时仍显示原因。

笔记内部提供“编辑、结构、图谱”三个模式。结构模式复用结构操作能力，图谱模式复用引用图谱能力；两者不再拥有独立顶层 Activity。模式按普通仓库保留，往返切换不改变当前笔记或编辑历史。

Problems 按 Activity 投影：

    普通活动：当前 Workspace diagnostics、普通仓库运行故障和来源 Activity 操作错误。
    Repository：Workspace diagnostics、普通仓库问题、内置数据问题、名称问题、运行故障和来源 Activity 操作错误。
    Journal：正文、系统语法、仓内引用、跨普通仓库引用诊断、日记运行故障和来源 Activity 操作错误。
    Todo：系统语法、CTN、缺少任务标记诊断、代办运行故障和来源 Activity 操作错误。
    Syntax：当前编辑 owner 的 profile 诊断，并附加该 owner 的内容诊断、运行故障和来源 Activity 操作错误。
    Agent：profile、模型、IPC、事件流、队列和 commit 故障；问题可定位回对应会话。
    Settings：完全不挂载 Problems。

问题行只定位内容、来源 Activity 或仓库详情，不执行破坏性操作；操作错误可独立关闭。保存成功不显示“已保存”，非稳定保存状态和五秒短暂反馈只显示在 24px 底栏右侧，不使用标题文字或通知浮层。

Notes、Journal、Todo、Syntax 和 Repository 的行操作只在选中项显示，固定使用“开/用、改、删”的顺序。重命名、删除和仓库危险操作都原地确认；切换选择取消未提交状态，不使用确认弹窗。Todo 详情树使用统一选中态、诊断和完成划线表达状态。


## 8. Agent

Agent Activity 是 owner 控制的内容修改入口。左侧只显示驻留会话与唯一的新建 `+`；
新建时在中间显示并使用设置中已保存的默认 profile，用户只选择不可扩大的硬范围，
不能在此切换 profile；创建后中间显示增量对话与取消；右侧显示单 store proposal
的 base revision、digest、change set、最终聚合 diff 与整批审批。界面
不展示 raw chain-of-thought，也不允许提交 model、URL、凭据或安全参数。

会话创建时只能选择一种领域范围：

    Workspace：repository、稳定 folder ID 及其后代，或精确 note ID。
    Journal：全域或一组精确 entry ID。
    Todo：全域或一组精确 collection ID。

范围之后不可扩大。folder 后代按稳定 ID 解析；范围根被删除后会话变为
unavailable。发送、批准和 destructive confirmation 前，客户端必须先把该范围
对应的已加载 draft 同步到 Server；offline、conflict、校验或同步失败会阻止
Agent 操作。

模型 tool input 只表达业务 intent。第一次 stage 固定 store 与 base snapshot，
后续 intent 顺序应用于 staged snapshot；proposal 的 change set 与 diff 只从原始
base 和最终 staged content 计算一次。proposal 只读、只属于一个 Workspace
repository、Journal 或 Todo store，只能整批批准或拒绝；包含删除时，批准后还需
独立二次确认。任意 revision 变化都使 exact CAS stale，不自动 retry、merge 或
rebase。跨 store 任务必须按顺序生成多份 proposal。

Agent 对话、压缩摘要和会话只驻留服务内存。服务重启、1 小时 idle TTL、24 小时
absolute TTL 或主动删除都会丢失会话。operation ledger 只记录 owner、session、
profile/runtime、store、revision、变更资源/块 ID、结果与时间，不记录提示词、
模型回复、正文、完整 diff 或 tool output。

Provider、Profile、模型参数与凭据由“设置 → 智能体”管理。Ollama 发现、provider
探测和 profile 符合性检查均为显式操作；不自动联网、创建、选模或 fallback。符合性
检查必须作为可查询、可取消的后台操作运行，不能以一个长 HTTP 请求占用客户端；检查
使用固定的一次工具调用与受限输出，生产 Profile timeout 仍是模型执行的最终时间上限。
Ollama 直接连接模型层而不嵌套本地代码 Agent。会话固定创建时的 provider/profile
version、digest 与有效参数；相关 resident session 会阻止危险配置删除或凭据变更。


## 9. 服务设置与数据迁移

网页、API、开发 HMR 与生产静态资源必须由同一个 Node origin 提供。用户不能通过
环境变量或客户端 JSON 配置监听、端口、路径、owner token、审计容量或 Provider
私网目标；这些事实只能从“设置 → 服务”或“设置 → 智能体”修改。

单一 origin 是部署契约，不是跨层调用许可。官方网页和未来浏览器界面只能通过
registry 声明的 `/api/v3` HTTP/SSE operation 使用后端能力；不得导入或调用
`infrastructure/server` 内部实现。该约束不禁止其他应用按授权策略访问公开 API。

首次服务只监听 `127.0.0.1:3001`。局域网模式必须已有 owner credential 与 HTTPS
public origin，TLS 由外部代理终止。远程浏览器通过 owner secret 建立 HttpOnly
session；本机 owner 同时检查 socket 与 Host。显式错误 Bearer 永远 401。

数据根迁移前同步所有已加载内容，并在 resident Agent session、配置冲突或另一迁移
存在时拒绝。迁移只复制当前权威分区，拒绝路径重叠和符号链接，逐文件校验后最后
切换 bootstrap 指针。失败继续使用源，成功重启服务，旧根作为人工备份保留。


## 10. 当前边界

搜索覆盖所有普通仓库、日记和代办，按领域、仓库和更新时间筛选；结果以稳定资源与块身份导航。单个来源故障不阻断其他来源，分页游标失效时要求使用当前条件重新搜索。

Todo 不包含截止日期、优先级、备注、筛选或跨集合任务移动。Journal 跨仓引用不进入普通仓库引用图谱。唯一 HTTP 契约是 `/api/v3`；外部 automation 只有 Workspace、Journal、Todo 只读能力，没有 command、preview、commit、write 或 delete 接口。完整 snapshot sync、Agent、仓库与 token 管理只授权 owner。本项目不提供外部 MCP、专用手机契约、Dockerfile、镜像或 Compose；只保留未来容器路径约定。
