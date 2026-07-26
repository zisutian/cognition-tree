// SPDX-License-Identifier: GPL-3.0-or-later

export const defaultTodoSyntaxSource = `formatVersion = 2
name = "代办"
tabDisplayWidth = 4

[[blocks]]
marker = "[]"
semanticId = "todo-item"
label = "代办"
kind = "line"
tone = "default"
textColor = "cyan"

[[inline]]
kind = "paired"
open = "[["
close = "]]"
semanticId = "global-reference"
label = "引用"
tone = "blue"
textColor = "blue"
`;
