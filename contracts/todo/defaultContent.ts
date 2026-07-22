// SPDX-License-Identifier: GPL-3.0-or-later

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
