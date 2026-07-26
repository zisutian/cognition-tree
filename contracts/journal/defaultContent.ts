// SPDX-License-Identifier: GPL-3.0-or-later

export const defaultJournalSyntaxSource = `formatVersion = 2
name = "日记"
tabDisplayWidth = 4

[root]
label = "正文"
tone = "default"
textColor = "default"

[[blocks]]
marker = ":"
semanticId = "definition"
label = "定义"
kind = "line"
tone = "green"
textColor = "teal"

[[blocks]]
marker = "?"
semanticId = "question"
label = "疑问"
kind = "line"
tone = "amber"
textColor = "amber"

[[blocks]]
marker = ">"
semanticId = "personal-understanding"
label = "理解"
kind = "line"
tone = "violet"
textColor = "violet"

[[blocks]]
marker = "-"
semanticId = "component"
label = "组分"
kind = "line"
tone = "blue"
textColor = "blue"

[[inline]]
kind = "paired"
open = "[["
close = "]]"
semanticId = "global-reference"
label = "引用"
tone = "blue"
textColor = "blue"

[[inline]]
kind = "paired"
open = "<"
close = ">"
semanticId = "local-reference"
label = "条目内块引用"
tone = "teal"
textColor = "teal"

[[inline]]
kind = "single"
marker = "\\\\"
semanticId = "parallel-separator"
label = "并列分隔"
tone = "amber"
textColor = "amber"
`;
