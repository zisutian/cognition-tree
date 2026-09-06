# 内容一致性

本文件拥有内容格式、可信边界、保存队列、三方合并与冲突恢复。模块职责见
[模块边界](architecture.md)，HTTP、账本及进程恢复见[服务运行](service-runtime.md)。

## 内容 contract

CTN 编译、分析、失效与 multiline 语义的专门说明见
[CTN 分析流水线](ctn-analysis-pipeline.md)；本节只拥有各领域内容 contract 和
跨层传递边界。

Workspace v4：

    服务端从真实目录、可见 `.ctn` 正文、隐藏 sidecar 和 `.ctn/syntax/` 重建 canonical content；`.ctn/repository.json` 的 durable atomic replace 是提交点。

Journal v3：

    { schemaVersion, syntaxSource, days }
    day = { date, lastIssuedSequence, entries }
    entry = { id, createdAt, updatedAt, timezoneOffsetMinutes, sequence, source }

days 按日期升序，entries 按 sequence 升序。删除最后一篇仍保留空 day bucket，保证序号不复用。标题固定为 YYYY-MM-DD-0001。

Todo v4：

    { schemaVersion, syntaxSource, collections }
    collection = { id, source, completions, recurrences }
    completion = { blockId, completedAt }
    recurrence = { blockId, stages, completions }
    stage = { id, startsOn, endsBefore, rule }
    recurrence completion = { stageId, occurrenceDate, completedAt }

collections 数组顺序就是用户顺序。每个集合是一篇 CTN；标题是内部固定集合名，缩进形成任务树，完成状态只来自 sidecar。daily、weekly、monthly 规则只保存本地 YYYY-MM-DD，不保存时区或零点任务；当前状态、下一日期和完成/总数由运行环境本地日期投影。规则修改追加从下一天生效的阶段，停止周期也保留历史。移动与缩进保留 block ID，删除或失去 todo-item 语义的源码块清除孤立 completion 与 recurrence。

Workspace v4、Journal v3 与 Todo v4 是各自唯一可运行格式。只有 epoch 与内容
同时完全不存在时才初始化空内容；缺一项、非当前 epoch、损坏内容和未来版本
一律原样保留并 fail closed。运行时不存在版本 reader、迁移、字段别名或自动
重置。

Journal/Todo 的 synthetic title 参与 canonical 解析，但不进入公开可编辑正文。两者分别注入 wire codec、preparation/transition policy、revision factory 和 empty-content factory；基础设施不得恢复 purpose content union 或内容类型分派。


## 数据可信与 preparation 边界

同一份内容依次经过四类边界，边界职责不得重叠：

    unknown ingress：contracts/api registry 是 HTTP request body 的唯一
    unknown → DTO 入口；HTTP client codec 与磁盘 reader 分别负责各自来源的 wire
    decode。内存 cache 接收 typed value，只做
    structuredClone 隔离；未来若改为持久化 cache，必须在反序列化入口重新 decode。

    typed handoff：decode 后只传递领域 Content。HTTP backend、cache、save queue
    和 store 写端口不得再次把 typed content 当 unknown 解析；外部 DTO、磁盘格式、
    schemaVersion 与 REST response 均不包含 projection。

    semantic preparation：VersionedContentPreparationPolicy 把 Content 准备为
    { content, projection }。Journal/Todo projection 是带
    Validated…ContentAnalysis 的 parse index；Workspace projection 统一包含 syntax
    编译结果、structure、parse index 与 context。client local-first repository 和
    server application use case 是各自信任边界内唯一的 write preparation owner；
    infrastructure store 只在读取持久化 before snapshot 时准备并按 SHA 缓存
    projection，写入口必须显式携带 `{ baseRevision, content, projection }`。客户端与
    服务端仍独立校验。projection 不序列化、不跨进程；revision/CAS 不匹配后不能
    复用旧 projection。

    transition authority：客户端 local-first repository 负责页面内 optimistic
    transition；服务端 store 在 CAS 锁内，以真正读到的 before 和
    待提交的 after prepared snapshot 执行 authoritative transition。commit receipt
    携带实际 before/after，事件投影直接消费 receipt。use case 可以先读 snapshot
    以增量准备 after projection，但该预读结果不是 authoritative before；若其后 CAS
    发生变化，store 必须拒绝事务，调用方重新加载和准备。

Agent preparation 不建立第二套领域 transition。Workspace、Journal、Todo 各自
公开 `prepareAgentCommand(snapshot, intent)`，只计算 staged after 和 projection，
不访问 store。第一条 intent 固定一个 versioned store 与 base snapshot，后续 intent
只消费前一 staged snapshot；最终 change set 和 diff 只比较原始 base 与最终
staged content。`commitAgentProposalExactly` 只接收已批准 proposal 内冻结的
`{ baseRevision, content, projection }` 并执行一次 CAS，禁止重新加载、重算、
自动重试或路径级 rebase。

领域命令通过 VersionedSessionController 唯一的 mutate 接口返回
`{ content, projection }`；增量 index 必须原样进入保存队列和 stageSnapshot。
query、search、resource projection 与 change projection 消费 store/session 已准备的
projection，不得重新建立全量索引。merge、冲突恢复和 working-tree reconciliation
生成新内容时只 preparation 一次，并用 analysis override 传递已经完成的单
note/entry/collection 分析。本地 store 在发布 repository metadata 提交点前完成完整
Workspace preparation；提交后的 validate 只检查读取完整性与 revision。


## 保存、同步与冲突

内容写入只有三个授权来源：owner 官方浏览器 sync、trusted-client 同步，以及已批准
Agent proposal。前两者共用服务端 merge-aware sync；Agent 始终使用冻结 proposal 的
exact CAS，revision 变化即 stale，不能进入自动合并。领域 transition、preparation 和
change projection 仍是内容语义的唯一 owner；HTTP handler、runtime、MCP、SSE、audit
和 presentation 不重建领域命令或变化。成功且 revision 实际变化时只生成并发布一次
DomainChangeSet；no-op、校验失败和 conflict 不发布 change event。

资源版本是内容 SHA-256；canonical block metadata 是 block createdAt/updatedAt
的唯一来源。Todo 正文、位置、completion 与 recurrence 语义变化都更新目标
block updatedAt，但并发判断不使用时间戳。

sync operation 接受经过验证的 base snapshot 与期望 content，先验证 base 正文与
revision 相符，再 direct commit 或执行 `merge(base, local, current)`；响应返回服务端
最终 snapshot 与 outcome，精确 wire schema 由 registry 独占。CAS 竞争最多重新读取并
计算三次，耗尽后返回可重试 `resource_conflict`。Workspace 以语法、树和单篇 note
为单元，Journal 以 entry 为单元，Todo 以 collection body、collection order、单任务
completion 和 recurrence 为单元三方合并；不同单元可自动合并，同一单元双改或删改
返回 `merge_conflict`。通用 merge equality 与本地优先 pending 判定共享同一结构比较
策略：对象键插入顺序不构成内容变化，数组顺序仍是领域事实；不得以原始
`JSON.stringify` 字节顺序制造伪冲突。
CTN 层依据已解析的 metadata 位置比较内容，仅忽略修改时间；块 ID、创建时间、
层级与正文差异仍参与判断。正文改回原样后可消除冲突，最终选择的内容保留同一身份的
最新修改时间。Journal 同日序号碰撞按所选一侧保留冲突条目身份，非冲突条目保留，
序号上界不回退，不重编号或改写既有标题。偏好本身不是已解决证明。
语法变化是 barrier，不能跨 grammar 自动合并。

浏览器发起同步时固定已提交内容 `L` 与 local revision `R`。响应 snapshot `S` 到达后，
若本地未变则安装 `S`；若已产生 `L2`，必须执行 `merge(L, L2, S)`，再以 local-revision
CAS 安装为基于 `S.revision` 的 pending。重叠时保存 `L/L2/S` 为本地 conflict；安装中
再次编辑最多重新计算三次，绝不能只把 `L2` 挂到新 revision。`conflict` 状态只有在
`base/local/remote/unitIds` 完整保存后才能发布；只取得远端 revision 或远端重读失败时
保留原 pending snapshot 并报告 sync error，不构造不可恢复的半冲突。服务端
`merge_conflict.currentRevision=C` 后的 GET 只有 revision 仍等于 `C` 才能使用旧冲突
单元，否则再次把原 base/local 交给服务端计算。刷新不会恢复尚未同步的 base 或
conflict。

冲突动作先由 VersionedSessionController 冻结 mutation、排空 local stage 并等待既有
sync，再读取完整 conflict snapshot，以其中 `{ localRevision, remoteRevision }` 作为
exact proof。repository 在同一解决操作中校验证明、rebase 并继续同步；会话直接安装
返回 transition chain 的最终 snapshot，不通过普通 reload 猜测结果。若 rebase 后同步
失败，新的本地权威 snapshot 与明确 sync error 一并交接，不能退回旧 conflict；若远端
再次形成重叠修改，则必须返回另一份完整 conflict snapshot。

完整 conflict 发布后仍允许普通编辑与 stage；repository 接受后的 snapshot 是内容、
revision、pending 和 conflict 的唯一权威。每次 stage 在 local-revision CAS 下重新计算
仍未处理的单元；只有未处理集合为空才恢复同步。保存队列只负责调度和按 transition
顺序安装结果，不保留独立旧冲突判断；过期 stage、sync 或远端事件不能重新发布旧冲突。
“远端并另存本地”的领域
transform 必须返回 covered unit ids，repository 在任何 rebase 前验证其与当前全部冲突
单元完全相等；syntax、tree、identity、order、completion、recurrence、删除或混合单元
只要无法无损表达，就整体拒绝，不允许以部分正文副本冒充成功。

`application/sync` 是通用协调器，只消费组合根注入的 `revisionOf`、`prepare`、
`merge`、`projectChanges` 与 prepared store port，不导入三个内容领域、HTTP 或
基础设施。trusted-client 先提交会使既有 Agent proposal stale；Agent 先提交后，
trusted-client 的非重叠变更可合并，重叠变更仍返回冲突。

## Todo 周期查询

Todo 查询中 recurrence 非 null 只表示存在周期历史，只有 active 才表示当前
周期。inactive recurrence 保留 completedCount/totalCount，但完成状态与写入按
普通任务处理并使用 occurrenceDate null；active 只能提交服务端给出的
currentOccurrenceDate。
