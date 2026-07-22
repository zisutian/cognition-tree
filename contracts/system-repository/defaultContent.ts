// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The initial Journal syntax is part of the v3 wire contract. It deliberately
 * lives beside that contract so storage can provision an empty repository
 * without importing the Journal domain or CTN parser.
 */
export const defaultJournalSyntaxSourceV3 = `name = "日记"
tabDisplayWidth = 4

[title]
type = "title"
label = "标题"
tone = "blue"
textColor = "cyan"

[body]
type = "body"
label = "正文"
tone = "default"
textColor = "default"

[[markers]]
marker = ":"
type = "definition"
label = "定义"
role = "normal"
tone = "green"
textColor = "teal"

[[markers]]
marker = "?"
type = "question"
label = "疑问"
role = "normal"
tone = "amber"
textColor = "amber"

[[markers]]
marker = ">"
type = "personal-understanding"
label = "理解"
role = "normal"
tone = "violet"
textColor = "violet"

[[markers]]
marker = "-"
type = "component"
label = "组分"
role = "normal"
tone = "blue"
textColor = "blue"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "引用"
tone = "blue"
textColor = "cyan"

[[inlineRules]]
kind = "paired"
open = "<"
close = ">"
type = "local-reference"
label = "条目内块引用"
tone = "teal"
textColor = "teal"

[[inlineRules]]
kind = "single"
marker = "\\\\"
type = "parallel-separator"
label = "并列分隔"
tone = "amber"
textColor = "amber"
`;

export const defaultTodoSyntaxSourceV3 = `name = "代办"
tabDisplayWidth = 4

[title]
type = "title"
label = "事项集合"
tone = "blue"
textColor = "cyan"

[[markers]]
marker = "[]"
type = "todo-item"
label = "代办"
role = "normal"
tone = "default"
textColor = "cyan"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "引用"
tone = "blue"
textColor = "cyan"
`;
