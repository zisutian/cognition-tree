# 服务运行

本文件说明状态持久级别、HTTP 与认证、操作账本、维护事务及 Agent 进程边界。
模块关系见[模块边界](architecture.md)，内容提交与合并见[内容一致性](content-consistency.md)，
实际启动、存储路径和恢复步骤见[部署与恢复](deployment.md)。

## 状态与存储

| 生命周期 | 状态 |
|---|---|
| 服务端持久状态 | Workspace、Journal、Todo 内容，启动配置、Provider/Profile、凭据及操作账本 |
| 浏览器 localStorage | 当前普通仓库 ID、默认 Agent Profile ID、内容树类型标签显示偏好 |
| 当前登录页面会话 | 内容 cache、草稿、冲突、页面标签、编辑器视图、工作台布局、Problems 和未提交表单 |

浏览器 cache 不构成离线持久存储；刷新后从服务端加载，不恢复未同步内容或页面会话。
偏好存储失败不阻止本次页面内操作。普通仓库切换不重建整个工作台，也不清空其他领域会话。

固定 bootstrap 拥有监听、端口、数据根指针、公开 origin、宿主机显示路径、审计容量和 owner
凭据聚合。内容、Agent 配置、凭据、审计与收据各有独立分区；物理共用数据根不改变其权威边界。
目录路径集中维护于[部署与恢复](deployment.md#数据控制区与迁移)。

服务状态目录采用 0700、文件采用 0600。安全 JSON 分区在跨实例锁内刷新磁盘状态后读取或修改，
原子替换及逐级目录 fsync 保证创建与提交持久性；解锁或完整性校验失败时关闭该分区的写入。
文件权限不等于静态加密。未知提交结果不能被包装为普通失败并清理可能有效的状态。

内容只接受各领域当前格式，规则见[内容一致性](content-consistency.md#内容-contract)。
bootstrap、Agent 配置、凭据及账本的历史控制格式由各自 codec 显式转换；转换验证完成后一次
切换权威，失败保留原状态。Agent 配置的升级影响见[部署与恢复](deployment.md#agent-配置存储升级)。
旧令牌分区不再作为权限输入；历史审计仍可读取，保留文件不代表恢复旧认证能力。

## 存储、协议与认证

### HTTP 契约

唯一 HTTP 契约是 API v4，由 [registry](../contracts/api/registry.ts)组合各领域的路径、方法、
请求响应 schema、operationId、权限和请求体上限。精确清单使用同一 registry 的 OpenAPI 输出。
请求的 Content-Length 与流式读取使用同一个 operation 上限，严格解码 UTF-8 与 JSON；
非法字节、超限和断连不能进入领域写入，也不能伪装成服务内部异常。

`ApiErrorSchema` 定义公开错误形状，服务端错误目录决定状态、可重试性和安全 details。
客户端使用显式错误语义，不仅凭 HTTP status 推测能否重试。通用协议错误和日志不暴露正文、diff、
secret、stack、提示词或工具原始输出；日志失败不改变既定 API 响应。
内容提交结果与普通协议错误的区别见[API 与 CLI 集成](api-integration.md#操作收据与不确定结果)。

### Owner 认证

HTTP principal 只有 local-owner 与 owner：

- local-owner 同时要求 socket remote address 与 Host 为 loopback；公共 Host 经本机反向代理不会获得本机权限。
- 远程 owner 通过签名 HttpOnly Cookie 认证，使用 SameSite=Strict、Secure、Path=/api/v4；写请求要求精确配置的 HTTPS Origin。
- 显式 Authorization 一律拒绝，不回退到免密钥认证。agent-session capability 仅存在于私有 IPC。
- 本机内容操作仅允许 local-owner；恢复操作仅在本机恢复服务开放。未知 principal 拒绝。

Owner 凭据轮换分 prepare 与 activate。prepare 只替换 pending 摘要，旧 active 仍有效；
activate 在同一权威提交中校验证明、提升摘要、递增版本并签发 Cookie。普通登录也在一次
一致读取中校验和签发。局域网授权只读取 active，清除操作同时清除 active 与 pending。
提交结果未知时不自动重试，页面保留已经交付的 secret；操作步骤见[设置操作](settings.md#所有者凭据)。
浏览器登录与登出串行执行，认证读取等待已开始的变更完成，旧响应不能覆盖新认证状态。

### 事件流

内容 SSE 只发送带 streamId 的 checkpoint 与无正文 change set。sequence 仅在同一 stream
内有序；服务重启后客户端重置去重状态。revision tracker 提供检查点，建立连接不扫描正文。

Agent 会话 SSE 发送连续编号的消息增量、proposal、problem、turn completion 及必要快照。
发现序列缺口、游标越界或重连时重新读取会话快照；旧列表和旧事件不能覆盖更新 sequence。
两类 SSE 均不替代内容或会话的权威快照。

`infrastructure/sse` 统一严格 UTF-8 解码、换行分帧、帧大小限制和 reader 清理；浏览器 HTTP
与模型 adapter 各自解释事件。服务端隔离慢连接和 socket 失败，通过断开及重同步恢复，
不让单个订阅者反向改变已提交内容、Agent turn 或其他连接。

## 操作账本

审计展示、内容操作收据和 Agent receipt 具有不同保留目的：

| 状态 | 持久与保留语义 |
|---|---|
| 审计 | 记录安全摘要，按配置容量裁剪展示历史 |
| 内容操作收据 | 按操作 ID 分文件持久化，不随审计容量裁剪；保存修改摘要和有限上下文差异 |
| Agent receipt | 按 proposal UUID、version 和 digest 去重，默认保留 24 小时，不随审计容量裁剪 |

内容收据与业务数据一样受私有目录权限保护。审计和 Agent receipt 不记录模型提示词、回复、
正文、完整 diff 或 tool output。展示容量不能决定幂等依据是否存在。

旧总账本中的内容收据先逐项持久化到独立分区，再移除旧副本；中断可重入，冲突副本拒绝覆盖。
首次读取与提交共用准备屏障。准备失败不得创建新意图或执行内容命令；准备完成后的已知收据
即使遇到审计分区故障仍可查询，这不授予新写入权限。账本状态经 capabilities 和管理状态暴露；
账本不可用时本机外部提交与 Agent 关闭写入，普通浏览器自动保存仍可用。

内容操作依次执行：

1. 持久化操作 ID、请求摘要、scope、命令与基线版本。
2. 在目录准入内加载权威内容、定位目标，记录仓库与对象身份、前后路径及预期提交版本。
3. 通过领域 prepared store 执行一次 CAS。
4. 先保存真实提交结果，再完成审计。

短账本事务不持有内容锁；普通仓库管理与内容定位共享目录准入。提交前的预期版本仅供对账，
不能冒充 afterRevision；真正的身份、差异和版本来自 commit receipt。

同 ID、同摘要返回既有收据，不同摘要拒绝。同进程复用在途操作；重启后孤立 pending 转为
indeterminate，禁止自动重放。审计失败保留 committed 结果；结果本身无法落盘时，同进程保留
已知提交，重启后保留不确定状态和提交前证据。Agent 的不确定提交同样进入提案终态，
不能再次批准或重放。调用方的查询、核对和退出码见 API 集成文档。

## 配置与迁移事务

服务配置通过 exact CAS 提交；bootstrap 是持久权威，审计容量等即时效果属于运行时投影。
投影失败保留已提交配置与旧 effective 值，并显示部分生效和重启要求，不回滚已完成的提交。
客户端的配置、探测、登录和符合性状态依各自版本安装；陈旧响应不得回退状态，实体删除或
digest 变化时一起裁剪相应派生状态。

数据根迁移由 application/system 协调；客户端通过 Workbench 排空已加载内容，基础设施实现
配置、持久记录及文件事务端口。迁移在不可逆步骤前保存源目标身份、摘要、revision 和阶段，
阶段与提交结果分别记录。

维护过程先阻止新内容请求和会话，排空已接纳请求及其派生写入，再核对仍驻留的 Agent、
设备登录与后台操作。读请求也可能初始化数据，必须参与排空。子任务持有独立写入租约，
父请求结束不能提前释放；结束请求中的延迟任务不能借旧租约重新开始写入。

文件事务通过排他创建取得目标所有权，拒绝路径重叠、已占用目录和符号链接。复制保留权限与
访问/修改时间，核对文件身份、实际字节、大小与摘要并落盘后，才提交指针。迁移范围与当前限制
见[部署与恢复](deployment.md#数据控制区与迁移)。源始终保留，失败保留已分配目标，自动清理只针对本次临时文件。

指针提交未知时保持维护并在 bootstrap 锁内对账：证明原 revision 未提交才恢复源服务；
证明目标 revision 且目标完整才继续重启；无法证明则保留诊断和重新对账入口。
启动先处理未结束迁移，再初始化内容服务。已完成记录不以旧摘要限制后续编辑；
迁移恢复不调用 bootstrap 重置，也不提供绕过校验的强制入口。

## 服务端适配与生命周期

服务端按存储事务、网络传输、模型适配与组合根划分；完整职责见模块注册表。长期运行保证是：

- Workspace 以受管工作树、WAL 和 repository metadata 提交点恢复事务；普通仓库删除先持久化 tombstone，再做可恢复清理。目录操作排空后才释放 store 和根写锁。
- 文件对账读取真实字节，不能仅用大小或 mtime 证明未修改；事务进入和应用前均重新校验。
- HTTP 停机先停止接纳，再关闭 SSE 与开发热更新连接，等待请求结束或有界断连，最后释放依赖资源及仓库写锁。完整 Vite 释放不能早于普通请求完成。
- 多项清理失败一起保留；关闭后的 catalog、lease、session 不重新启动，迟到任务不能重新获得写入资格。
- JSONL、SSE 和私有 IPC 的传输层处理有界解码、响应关联和连接终态；应用层不持有 socket，也不让传输失败改写领域提交结果。

启动与受控重启步骤见部署文档。静态运行包不依赖 Vite，开发适配器只在开发模式创建。

## Agent 与模型进程

### 配置、会话和审批

Provider/Profile 配置规则与当前参数校验由 application/agentConfiguration 拥有，磁盘旧格式
解码只转换历史输入后调用同一校验入口。服务端会话和 Provider 操作由 application/agentHost
拥有；runtime 只组合领域端口、凭据、模型与进程适配。

会话从配置解析到 runtime 释放持有使用租约，固定 Profile 与 Provider。普通 Profile 修改
不改变既有会话；创建中或驻留会话阻止相关危险删除及凭据变更。Provider 修改与凭据切换持有
互斥变更租约。单个 Profile 无效不回退到其他 Profile；每个 Profile 按请求顺序串行推理，每个
session 同时只有一个 active turn，达到驻留上限
时拒绝新会话，不驱逐有效会话。会话失效期限见[产品需求](product-requirements.md#8-agent)。

提案包含冻结的基线、最终内容、确定性 review 和 digest；界面只渲染 review，不重新解析或
调用模型概括差异。会话取消、失败或 turn 结束仍按未决提案恢复状态，不能把待审批或待删除
确认降格为空闲。批准与提交语义见[内容一致性](content-consistency.md#数据可信与-preparation-边界)。

探测、登录与符合性检查各自拥有操作记录、取消和终态任务。新操作、实体变更或确认终态的
取消才替换原操作；不可中断的 finishing/recording 阶段仍由原任务完成。服务关闭等待后台
终态任务并回收全部进程，清理失败不得成为无人处理的异步错误。

### 凭据与隔离

Provider 同时只激活一种认证；凭据分区保存密钥或受管登录态，配置只持有引用。
设备码登录从准备到终态持有变更租约；失败、取消、过期和确定冲突回收候选。
持久提交未知时保留可能已有效的候选，重启后以权威配置引用核对并回收孤儿。
私网许可和探测的用户规则见[设置操作](settings.md#agent-provider-配置与认证)；推理、probe
与 conformance 均在请求前重新解析目标，不能绕过该地址策略。

Codex adapter 使用项目锁定的软件包，验证版本和入口；每条会话启动独立 app-server，使用
临时 cwd、隔离 HOME/CODEX_HOME、ephemeral 会话、只读 filesystem、禁用 network、
approval never，并验证 instructionSources 为空。不读取个人配置、会话、AGENTS、skills、
hooks、plugins 或 MCP。API Key 经登录协议注入，不进入进程或工具环境；环境使用 allowlist。
缺少 sandbox、版本不匹配或隔离断言失败时禁止创建会话。

进程事件按到达顺序处理，turn 完成等待先前事件处理结束；处理失败使 turn 失败。
会话结束先撤销 capability，再有界 interrupt，必要时分阶段终止并确认 exit，最后清理临时目录。
dispose 幂等，退出使全部 pending 及后续协议请求失败。

### 工具与模型协议

模型只通过会话硬范围内的读取、搜索、语法说明和领域暂存工具访问内容。
工具 wire schema 由 contracts/agent 统一提供，实际领域行为经服务端组合根接线。
Codex 的会话 STDIO MCP 经私有 IPC 和短期 capability 取得范围化 catalog，不持有全局工具表、
不直接导入 store；IPC 关闭仍等待已经接纳的 handler 完成。项目不提供公开 MCP endpoint。

CTN 写作语法来自当前 staged/store projection。模型创建或替换正文前必须读取写作指南，
会话记录 owner 与 presentation fingerprint；语法变化后重新读取，不能用旧指南继续暂存。
范围和目标领域来自不可变 session scope，不允许模型重新声明或扩大。

OpenAI-compatible 与 Ollama adapter 消费同一工具契约。多个调用、未知工具或非法参数在该次
响应中零执行，并返回脱敏协议错误要求纠正；纠正受工具步数限制。工具信封与结果不生成聊天增量。
最终正文、reasoning、工具调用和终止原因分别处理：长度耗尽、过滤、无正文或缺失终止帧明确失败，
不隐藏重试或 fallback。原始 reasoning 仅在当前工具循环内存中连续传递，不进入界面、事件、日志或审计。

会话历史与在途增量按实际字符计数控制预算，不估算 token 或修改 Ollama 的模型上下文设置。
用户配置、发现、探测和符合性操作见设置文档；模型服务保持外部，由其自身管理生命周期。
