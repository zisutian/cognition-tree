// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../common/json.ts";
import type { JournalContentDto } from "./types.ts";

export function serializeJournalRevisionContent(content: JournalContentDto) {
  return serializeJsonIteratively(content, { sortObjectKeys: true });
}
