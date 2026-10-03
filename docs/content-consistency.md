# 内容一致性

本文件定义内容格式、可信边界、写入与同步、冲突恢复和目录版本。
模块关系见[模块边界](architecture.md)，持久收据和进程恢复见[服务运行](service-runtime.md)。

## 内容 contract

| 领域 | 当前格式与权威 |
|---|---|
| Workspace v4 | 从真实目录、可见 `.ctn` 正文、隐藏 sidecar 和 `.ctn/syntax/` 重建 canonical content；`.ctn/repository.json` 的持久原子替换是提交点 |
| Journal v3 | 按日期与当日序号组织 entry；删除最后一篇仍保留序号上界，既有身份与标题不重编号 |
| Todo v4 | 有序 CTN collection，completion 与 recurrence 存在 sidecar，任务身份由稳定 block ID 关联 |

只有 epoch 与内容同时不存在时才初始化。缺一项、非当前 epoch、损坏或未来格式均原样保留并
关闭写入，不使用历史内容 reader、字段别名、自动迁移或静默重置。各领域内容结构由自己的
公开类型和 codec 拥有，不引入通用内容 union。

Journal/Todo 的内部标题参与 canonical 分析，但不进入可编辑正文。数组顺序可构成领域事实；
对象属性插入顺序不构成变化。canonical block metadata 是创建和修改时间的来源，
Todo 正文、位置、完成与周期语义变化更新目标块修改时间；时间戳不用于并发判定。

CTN 编译与分析见[CTN 分析流水线](ctn-analysis-pipeline.md)，日记与周期的用户行为见
[产品需求](product-requirements.md#2-平级内容领域)，HTTP schema 见[API registry](../contracts/api/registry.ts)。

## 数据可信与 preparation 边界

内容在一次信任范围内依次经过以下边界：

| 边界 | 输入、输出与责任 |
|---|---|
| 外部解码 | HTTP request 由 registry 解码，HTTP response 和磁盘数据由各自 codec 解码；内存 cache 接收 typed value 并隔离引用 |
| 类型传递 | 解码后传递领域 Content，backend、cache、queue 和 store 写端口不重复按 unknown 解码 |
| 语义准备 | preparation 将 Content 转为 `{ content, projection }`，projection 包含已校验的语法、分析或领域索引 |
| 权威提交 | store 在 CAS 锁内以真实 before 和 prepared after 提交，receipt 返回实际前后快照，事件直接消费 receipt |

客户端 local-first repository 与服务端 application 用例分别负责各自信任范围内的写入准备，
客户端通过校验不免除服务端校验。store 读取持久 before 时准备并缓存其投影；
写入口显式接收 `{ baseRevision, content, projection }`。projection 不序列化、不跨进程，
不进入内容格式或 REST response；CAS 基线失效后不能复用旧准备结果。

领域命令通过统一 mutation 接口返回 content 与 projection，增量索引随结果传入保存队列。
查询、搜索和资源投影复用已准备结果，不重建全量分析；合并、恢复或工作树对账生成新内容时
准备一次，沿用已经完成的单文档分析。提交点之前完成内容准备，提交后的读取校验不再改变内容。

Workspace 移动以目录身份集合或源笔记的稳定块 ID 集合、目标身份与位置作为业务请求。
目录和内容分别由唯一批量实现处理，单项入口只适配为单元素集合；行号仅在当前分析中用于
计算源码范围。移动根按原树序排列，父项携带完整后代，重叠选择只移动一次。整批校验身份、
循环、标题保护和目录重名后一次准备并提交；任一项失效则全部拒绝，不自动改名或部分执行。
结果完全不变时返回成功，不触发保存。源码范围与身份登记见[CTN 分析流水线](ctn-analysis-pipeline.md)。

Agent 使用各领域中立 preparation 入口，不建立另一套变换规则。第一条意图固定存储和原始
base，后续意图只消费前一 staged snapshot；最终差异比较原始 base 与最终 staged content。
review 包含资源名称、语义动作、块计数及有限上下文差异，并进入冻结提案摘要。
批准后的提交只接受冻结的基线、内容和投影，执行一次 CAS，不重新加载后重算或路径级合并。

## 保存、同步与冲突

### 写入入口

| 入口 | 并发语义 |
|---|---|
| 官方浏览器同步 | 验证 base 与 revision 后直接提交或进行三方合并 |
| 本机内容操作 | 一次 exact CAS，基线过期返回冲突，不自动重算、合并或重放 |
| 已批准 Agent proposal | 对冻结内容执行一次 exact CAS，基线变化使提案失效 |

领域 preparation、transition 与 change projection 决定内容语义，HTTP、事件、审计和界面
不重建变化。revision 实际改变时只发布一次 DomainChangeSet；no-op、校验失败和冲突不发变更事件。
任一入口先提交，都会使其他入口持有的旧基线过期。本机调用见[API 与 CLI 集成](api-integration.md)。

浏览器移动的成功表示本地会话已接受完整变更；后续异步 stage 或同步失败进入既有未同步内容
与恢复流程，不能将该回执解释为持久保存成功，也不能自动重放移动或撤销用户后续编辑。

### 三方合并

服务端以 `merge(base, local, current)` 合并，返回最终快照与 outcome；CAS 竞争采用有界重算，
耗尽后返回可重试 `resource_conflict`。合并单元如下：

- Workspace：语法、树和单篇笔记。
- Journal：单篇日记。
- Todo：集合正文、集合顺序、单任务 completion 与 recurrence。

不同单元可自动合并，同一单元双改或删改形成 `merge_conflict`。语法变化是屏障，不能跨 grammar
自动合并。内容等价比较忽略对象属性顺序，但保留数组顺序、块身份、创建时间、层级和正文差异。
CTN 仅忽略修改时间，并为最终保留身份采用最新修改时间；正文改回原样可消除冲突。
Journal 同日序号冲突按用户选择保留相应身份，非冲突日记和序号上界保留，不重编号。

### 在途编辑与会话状态

浏览器固定已发送内容 `L` 及 local revision。响应 `S` 到达时，若本地已经产生 `L2`，
执行 `merge(L, L2, S)` 后用 local-revision CAS 安装，不能直接把新草稿挂到远端 revision。
安装时再次编辑需有界重算；重叠则完整保存 `L/L2/S` 及冲突单元。

只知道远端 revision 或冲突详情读取失败时，保留原 pending 并报告同步错误，不能发布半份冲突。
服务端冲突后回读的版本必须与冲突证明匹配；若已变化，应重新计算原意图，不能套用旧冲突单元。
已接受的远端检查点不再触发重复 reload，新检查点仍按当前会话状态对账。

接受的 repository snapshot 是内容、revision、pending 和 conflict 的唯一权威。
保存队列负责调度与按 revision 顺序交接 transition，丢弃过期分支，不另存冲突判断。
完整冲突存在时仍允许普通编辑与 stage，逐次重新计算剩余冲突，集合为空才恢复同步。
刷新不恢复未同步草稿、base 或 conflict。

### 显式冲突解决

解决动作先冻结 mutation、排空 local stage 并等待既有 sync，再取得完整冲突快照，
用其中的 `{ localRevision, remoteRevision }` 作为精确证明。repository 在同一次操作内
校验证明、rebase 并继续同步，会话直接接受返回 transition 的最终状态，不用普通 reload 猜测结果。

rebase 后同步失败时交接新的本地快照与同步错误，不退回旧冲突；远端再次重叠时返回另一份
完整冲突。偏好选择本身不是解决证明。“采用远端并另存本地”必须证明覆盖全部被丢弃单元，
无法无损表达的语法、树、身份、顺序、任务状态、删除或混合冲突在写入前整体拒绝。

界面统一消费 ready 投影中的 `canMutate`；reload、解决冲突或删除准备时暂停编辑，
完成或恢复后重新开放。不能从 conflict 标签自行推导只读，也不能只禁用部分修改入口。

## 仓库目录状态

目录控制器拥有当前页面接受的 catalog。缓存仅提供离线投影，不能覆盖已接受的新目录或
创建、重命名、删除结果。离线刷新保留对象和选择，但清除可提交的目录 revision；
重新读取有版本的目录后恢复写入资格。缓存保存失败不改变已确认提交。

目录及会话并发刷新只允许有效的新结果发布，旧生命周期不得改写活动仓选择。
创建和管理回执保留真实提交结果，后续刷新失败另行表达；外部调用处理见 API 集成文档。

## Todo 周期查询

recurrence 非 null 只表示存在周期历史，只有 active 才表示当前周期。
inactive 保留完成/总数统计，写入与完成状态按普通任务处理，occurrenceDate 为 null；
active 使用服务端返回的 currentOccurrenceDate。删除块或移除任务语义时清除孤立完成与周期记录。
查询版本和状态基于同一不可变集合及本地日期，局部读取不计算无关任务。
