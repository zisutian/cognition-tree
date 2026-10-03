# CTN v2 分析流水线

本文件定义 CTN 编译、分析、增量复用和源码呈现契约。领域内容格式与保存见
[内容一致性](content-consistency.md)，界面控件和导航见[界面规范](ui-guidelines.md)。

## 所有权

`compileCtnSyntaxSource(source, owner)` 是语法源码入口，负责 TOML 解码、字段校验、owner
policy、最长 token 匹配及稳定 key，只接受 `formatVersion = 2`。
`analyzeCtnSource({ source, mode, syntax })` 是内容分析入口，统一生成行表、块树、行内范围、
诊断、canonical/editable 坐标和 multiline 的 lexical 源码范围。

Parser 只解释源码，导航、诊断和命令消费分析结果，不另建 parser 调用或行表。
canonical 页面消费 application 已准备的 syntax、document 与 parse index；未保存草稿可在
editor analysis adapter 内分析。没有已准备语法时显式显示 raw/unavailable，不制造默认语法。

## 数据流

```text
syntax source
  -> compileCtnSyntaxSource(owner)
  -> immutable CtnCompiledSyntax
       ├─ blockGrammarKey
       ├─ inlineGrammarKey / analysisKey
       └─ presentationKey

CTN source + mode + compiled syntax
  -> analyzeCtnSource
  -> CtnSourceAnalysis
       ├─ domain parse index / block-id registry
       ├─ metadata reconciliation and edit planners
       └─ CodeMirror analysis StateField
            ├─ source decorations
            ├─ diagnostics / navigation
            └─ text-editor commands
```

三个领域会话各自持有 parse index，块身份通过共享 registry 机制管理，引用图缓存由对应
Workspace parse index 实例持有。单文档编辑只分析候选文本一次，metadata 协调后将结果
canonicalize，并通过 analysis override 更新索引；未变化文档复用旧分析，不进入热编辑扫描。
创建和结构移动同样传递已经构建的 canonical analysis。

身份变更核对受影响对象的集合；纯文字变化保留身份时复用 registry，增删或跨对象移动原子登记
并拒绝重复 ID。新身份分配以旧文档和外部保留身份为约束。复用基于不可变分析与实际身份集合，
不以时间戳或全局可变缓存代替校验。

## 失效规则

| 变化 | 处理 |
|---|---|
| blockGrammarKey | 重新分析，并按 owner policy 重建受影响文档的块元数据 |
| inline grammar | 重新分析，保留块元数据 |
| presentationKey | 复用源码事实，仅重投影已有 analysis 中的 rule 引用 |
| 名称、颜色、ARIA、勾选状态、Tab 显示宽度 | 不改变解析事实；展示变化按对应投影重绘 |

CodeMirror 通过不可变 runtime 配置与持久 analysis StateField 接受更新，
正文或 analysis key 变化才重分析；不通过可变语法引用、第二套保护解析或强制重置编辑器状态刷新。

## 多行源码

Parser 根据 opener、同缩进同 token 的 closer 识别 lexical 范围。闭合和未闭合块均保持
逐字节可见、可选择、可编辑；不创建卡片、隐藏区、atomic 前缀、视觉缩进补偿或专用输入命令。
Tab、Enter、删除及复制粘贴遵循普通文本选区行为，使临时不完整源码也能直接修复。

结构移动从同一份当前分析解析各移动根的完整 lexical 范围，不能只移动 opener；移动或落点
范围尚未闭合时拒绝操作。一次计算全部删除范围与插入位置，保留相对缩进、多行正文和稳定
身份，每个受影响文档只分析一次最终源码并传递 analysis override。批量提交与失败语义见
[内容一致性](content-consistency.md#数据可信与-preparation-边界)，不进入编辑器输入路径。

### 颜色与展示

- 块的 tone 与 textColor 作用于 opener、正文和 closer；label 是规则和结构名称，不额外插入编辑器标题。
- 行内有效颜色作用于 marker 和整个 span 的下划线，span 正文保留所在块的文字颜色。
- display/block tone 允许 default，界面称为“背景”；草稿预览和保存后重投影消费同一 rule tone。
- Todo owner policy 固定 todo-item 的名称“代办”、标记 `[]`、line 类型和 semantic ID，背景与内容颜色可编辑。

## 架构守卫

结构检查约束编译器独占 TOML 解码、analysis 独占 parser、editor analysis adapter 独占展示层
草稿分析。CTN 格式不设历史 reader、字段别名或兼容开关；源码呈现不引入隐藏和保护范围。
这些约束与领域索引行为回归共同验证流水线，测试入口见[测试指南](testing.md)。
