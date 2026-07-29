# CTN v2 分析流水线

## 所有权

CTN 语法源码只有一个入口：`compileCtnSyntaxSource(source, owner)`。编译器负责 TOML 解码、严格字段检查、owner policy、最长 token 匹配器和稳定 key。运行时只接受 `formatVersion = 2`；不存在 v1 reader、字段别名、fallback、迁移开关或第二套 draft schema。

CTN 内容只有一个分析入口：`analyzeCtnSource({ source, mode, syntax })`。它一次扫描建立 `CtnSourceAnalysis`，其中包含：

- 同一个 `CtnSourceText` 行表；
- block tree、inline span 与诊断；
- canonical/editable 坐标投影；
- multiline block 的 lexical 源码范围。

Parser 只解释源码；presentation、导航、诊断和命令不得直接调用 parser，也不得重建行表。Multiline 范围是语法事实，只用于结构、元数据和普通源码着色，不产生第二套编辑布局。

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
            ├─ ordinary source decorations
            ├─ diagnostics / navigation
            └─ standard text-editor commands
```

Workspace、Journal 和 Todo 会话各自持有 parse index 与共享 block ID registry。单文档编辑只分析候选 editable 文本一次，metadata 协调器把该分析直接 canonicalize，下一索引通过 analysis override 差量替换对应文档。创建和结构移动同样返回已构建的 canonical analysis。未变化文档只能复用旧索引，不能被热编辑路径访问。

## 失效规则

- `blockGrammarKey` 变化：重新分析并按 owner policy 重建受影响文档的 block metadata。
- inline grammar 变化：重新分析，保留 block metadata。
- `presentationKey` 变化：仅重投影已有 analysis 中的 rule 引用。
- 名称、颜色、ARIA、勾选状态和 Tab 显示宽度变化：只重绘；Tab 宽度不属于解析事实。

CodeMirror 只有一个不可变 runtime facet/compartment 和一个持久 analysis `StateField`。文档或 analysis key 变化时重分析；展示变化复用 source facts。禁止可变 syntax ref、独立保护解析、presentation 解析和 `view.setState(view.state)` 强制重绘。

## 多行源码

Multiline 规则仍由 parser 识别 opener、相同缩进和 token 的 closer，以及两者之间的 lexical 范围。闭合和未闭合块都保留逐字节可见、可选择、可编辑的源码；编辑器不创建卡片、隐藏范围、atomic 前缀、视觉缩进补偿或专用鼠标/键盘命令。

规则的 `tone` 和 `textColor` 通过普通 decoration 覆盖 opener、正文与 closer。`label` 仍是语法规则及结构元数据的名称，不作为额外编辑器标题插入。Tab、Shift+Tab、Enter、删除、复制和粘贴遵循 CodeMirror 的普通文本选区行为，因此任何临时不完整结构都能直接修复。

行内 presentation 只消费一个有效颜色：它作用于 opener/closer 或 single marker 以及整个 span 的下划线，span 正文不覆盖所在块的文字颜色。Todo 的 owner policy 固定 `todo-item` 的名称、`[]`、line 类型和 semantic ID；其背景与内容颜色仍属于可编辑 presentation。

所有 display/block `tone` 都允许 `default`，UI 将其命名为“编辑器背景”。预览直接读取 draft tone；保存后的 compiler presentation key 触发 analysis presentation reproject，编辑器的 title、root、line 和 multiline lexical lines 都读取重投影后的同一 rule tone，不为背景建立第二套状态。

领域层按块移动或重排源码时仍使用 parser 给出的 lexical 范围，以免只移动 opener；这是结构事务语义，不进入编辑器输入路径。

## 架构守卫

架构测试锁定以下事实：

- `smol-toml` 只能由 v2 compiler 导入；
- `parseCtnSourceText` 只能由 analysis 层调用；
- presentation 只有 editor analysis owner 可以调用 `analyzeCtnSource`；
- presentation 不得存在 multiline 卡片、保护范围或专用编辑 planner；
- 生产源码不得出现运行时格式迁移、字段别名、兼容分支或强制重绘补丁。
