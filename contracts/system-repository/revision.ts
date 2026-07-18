// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../workspace-repository/json.ts";
import type { SystemRepositoryContentDto } from "./types.ts";

export function serializeSystemRepositoryRevisionContent(
  content: SystemRepositoryContentDto,
) {
  return serializeJsonIteratively(content, { sortObjectKeys: true });
}
