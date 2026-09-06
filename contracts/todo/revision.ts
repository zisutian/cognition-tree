// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../common/index.ts";
import type { TodoContentDto } from "./types.ts";

export function serializeTodoRevisionContent(content: TodoContentDto) {
  return serializeJsonIteratively(content, { sortObjectKeys: true });
}
